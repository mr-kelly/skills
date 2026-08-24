#!/usr/bin/env node
// Single write-path for cloud billing data — the AirApp browser never calls
// billing APIs itself. The agent gathers a payload JSON (from cloud billing
// skills/exports, e.g. aws-billing/google-cloud-billing), this script
// validates it, merges it into Busabase's Spend Providers/Products Bases,
// and flags anomalies (MTD above the configured % of last month), proposing
// an investigate_spend action card. Anomaly math is ported verbatim from the
// retired scripts/ingest_spend.ts.
//
// Usage: node scripts/ingest_spend.mjs /path/to/spend_payload.json [--apply]
//
// Payload shape:
// {
//   "currency": "USD",
//   "providers": [
//     { "provider_id": "gcp", "name": "Google Cloud", "mtd": 812.4, "last_month": 501.42, "note": "optional" }
//   ],
//   "products": [
//     { "product_id": "relayapi", "product": "RelayAPI", "mtd": 1244.48, "last_month": 987.87 }
//   ]
// }
//
// Without --apply this is a dry run that only prints what would be written.
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-devops-app/app/js/config.js";
import { round2 } from "../content/kelly-devops-app/app/js/devops-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_spend.mjs /path/to/spend_payload.json [--apply]

Validates and merges a cloud billing payload into Busabase (Spend
Providers/Products), and proposes an investigate_spend action card for any
provider whose month-to-date spend exceeds the configured anomaly threshold
above last month. Without --apply this is a dry run.`);
}

function fail(message) {
  console.error(`ingest_spend: ${message}`);
  process.exit(1);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, idField, idValue, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-devops-ingest-spend",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-devops-ingest-spend",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
  if (flags.has("--help") || flags.has("-h")) return help();
  const apply = flags.has("--apply");
  const payloadPath = args[0];
  if (!payloadPath) return help();

  let payloadText;
  try {
    payloadText = await readFile(payloadPath, "utf8");
  } catch {
    fail(`cannot read payload JSON at ${payloadPath}`);
  }
  const payload = JSON.parse(payloadText);
  if (!Array.isArray(payload.providers) || !payload.providers.length)
    fail("payload.providers must be a non-empty array");
  payload.providers.forEach((row, index) => {
    if (!row.provider_id) fail(`payload.providers[${index}].provider_id is required`);
    requireNumber(row, "mtd", `payload.providers[${index}]`);
    requireNumber(row, "last_month", `payload.providers[${index}]`);
  });
  (payload.products || []).forEach((row, index) => {
    if (!row.product) fail(`payload.products[${index}].product is required`);
    requireNumber(row, "mtd", `payload.products[${index}]`);
    requireNumber(row, "last_month", `payload.products[${index}]`);
  });

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly DevOps Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [providerRows, productRows, actionRows, settingsRows] = await Promise.all([
    readAll(client, declared("spend-providers")),
    readAll(client, declared("spend-products")),
    readAll(client, declared("actions")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const anomalyPct = Number(settings.spend_anomaly_pct || 40);
  const currency = payload.currency || "USD";
  const now = new Date().toISOString();

  const providerById = new Map(providerRows.map((row) => [row.provider_id, row]));
  const nextRef = () => actionRows.reduce((max, row) => Math.max(max, Number(row.ref || 0)), 0) + 1;

  let anomalies = 0;
  for (const row of payload.providers) {
    const mtd = round2(row.mtd);
    const lastMonth = round2(row.last_month);
    const deltaPct = lastMonth > 0 ? round2(((mtd - lastMonth) / lastMonth) * 100) : 0;
    const anomaly = lastMonth > 0 && mtd > lastMonth * (1 + anomalyPct / 100);
    const providerId = String(row.provider_id);
    const existing = providerById.get(providerId);
    const outcome = await upsertRow(
      client,
      declared("spend-providers"),
      existing,
      "provider-id",
      providerId,
      {
        provider_id: providerId,
        name: row.name || providerId,
        currency,
        mtd,
        last_month: lastMonth,
        note: row.note || "",
        updated_at: now,
      },
      `Spend for ${providerId}`,
      apply,
    );
    console.log(
      `${apply ? outcome : "would upsert"} spend ${providerId}: MTD ${currency} ${mtd.toFixed(2)} (${deltaPct > 0 ? "+" : ""}${deltaPct}% vs last month)${anomaly ? " ANOMALY" : ""}`,
    );

    if (anomaly) {
      anomalies += 1;
      const actionId = `act-spend-${providerId}`;
      const alreadyExists = actionRows.some((action) => action.action_id === actionId);
      if (!alreadyExists) {
        const ref = nextRef();
        const fields = {
          action_id: actionId,
          ref,
          type: "investigate_spend",
          title: `Investigate ${row.name || providerId} spend spike (${deltaPct > 0 ? "+" : ""}${deltaPct}% MTD)`,
          status: "needs_review",
          reason: `${row.name || providerId} month-to-date is ${currency} ${mtd.toFixed(2)} vs ${currency} ${lastMonth.toFixed(2)} last month, above the ${anomalyPct}% anomaly threshold.`,
          evidence: JSON.stringify([
            `Month-to-date: ${currency} ${mtd.toFixed(2)}.`,
            `Last month total: ${currency} ${lastMonth.toFixed(2)}.`,
            `Delta: ${deltaPct > 0 ? "+" : ""}${deltaPct}% against a ${anomalyPct}% threshold.`,
          ]),
          plan: JSON.stringify([
            `Pull a per-service cost breakdown for ${row.name || providerId}.`,
            "Identify which service or deploy drives the increase.",
            "Propose a budget alert or remediation.",
          ]),
          target: JSON.stringify({ kind: "spend", id: providerId, provider: providerId }),
          note: "",
          created_at: now,
        };
        const actionOutcome = await upsertRow(
          client,
          declared("actions"),
          null,
          "action-id",
          actionId,
          fields,
          `Propose investigate_spend for ${providerId}`,
          apply,
        );
        actionRows.push({ action_id: actionId, ref });
        console.log(`${apply ? actionOutcome : "would create"} action ${actionId} (ref ${ref})`);
      }
      const eventId = `evt-spend-${providerId}-${Date.now()}`;
      await upsertRow(
        client,
        declared("events"),
        null,
        "event-id",
        eventId,
        {
          event_id: eventId,
          at: now,
          severity: "warning",
          kind: "spend",
          message: `${providerId} month-to-date spend is ${deltaPct > 0 ? "+" : ""}${deltaPct}% vs last month; anomaly flagged.`,
          service_id: "",
        },
        `Event ${eventId}`,
        apply,
      );
    }
  }

  const productById = new Map(productRows.map((row) => [row.product_id, row]));
  for (const row of payload.products || []) {
    const productId =
      row.product_id ||
      String(row.product)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
    const mtd = round2(row.mtd);
    const lastMonth = round2(row.last_month);
    const outcome = await upsertRow(
      client,
      declared("spend-products"),
      productById.get(productId),
      "product-id",
      productId,
      { product_id: productId, product: row.product, currency, mtd, last_month: lastMonth, updated_at: now },
      `Spend allocation for ${productId}`,
      apply,
    );
    console.log(`${apply ? outcome : "would upsert"} product spend ${productId}: MTD ${currency} ${mtd.toFixed(2)}`);
  }

  const summaryEventId = `evt-spend-ingest-${Date.now()}`;
  await upsertRow(
    client,
    declared("events"),
    null,
    "event-id",
    summaryEventId,
    {
      event_id: summaryEventId,
      at: now,
      severity: anomalies ? "warning" : "info",
      kind: "spend",
      message: `Spend ingest completed: ${payload.providers.length} provider(s), ${anomalies} anomaly(ies).`,
      service_id: "",
    },
    `Event ${summaryEventId}`,
    apply,
  );

  console.log(`Ingested ${payload.providers.length} provider(s), flagged ${anomalies} anomaly(ies).`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
