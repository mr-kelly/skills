#!/usr/bin/env node
// Trusted seed step. Writes the fixed 9-vehicle / 6-item-per-vehicle mock
// batch (ported verbatim from the retired scripts/generate_batch.ts, now
// living in app/app/js/tracker-model.js's buildSeedData()) into the
// Busabase `vehicles` and `items` Bases, resetting every item's decision
// fields to a fresh pre-populated mix (verified / needs-source / flagged /
// needs-review) exactly like the retired script did for
// app/.data/current_batch.json. Also (re)writes the `settings` Base's `run`
// row (batch id + generated-at) and, on first run only, seeds a default
// `config` row (reviewer name) so it can be set once per install. No
// external calls — all vehicle/entity names are generic placeholders.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { buildSeedData } from "../app/app/js/tracker-model.js";

function help() {
  console.log(`Usage: node scripts/generate_batch.mjs [--apply]

Without --apply this is a dry run that only prints what would be written.
With --apply it writes the fixed 9-vehicle mock portfolio (54 disclosure
items total) to the Busabase "vehicles" and "items" Bases, resetting every
item's decision fields to the standard pre-seeded mix, and refreshes the
"run" settings row. Seeds a default "config" settings row only if none
exists yet.`);
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

async function upsert(client, declared, idFieldSlug, idValue, existingRows, fields, message) {
  const existing = existingRows.find((row) => row[idFieldSlug.replaceAll("-", "_")] === idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-disclosure-tracker-generator",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-disclosure-tracker-generator",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const args = parseArgs(argv);

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Disclosure Tracker Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const vehiclesBase = resources.bases.find((base) => base.key === "vehicles");
  const itemsBase = resources.bases.find((base) => base.key === "items");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  const [existingVehicles, existingItems, existingSettings] = await Promise.all([
    readAll(client, vehiclesBase),
    readAll(client, itemsBase),
    readAll(client, settingsBase),
  ]);

  const now = new Date().toISOString();
  const batchId = `disclosure-${now.slice(0, 10).replace(/-/g, "")}-${now.slice(11, 19).replace(/:/g, "")}`;
  const { vehicles, items } = buildSeedData({ now });

  console.log(
    JSON.stringify(
      {
        generated_at: now,
        batch_id: batchId,
        dry_run: !args.apply,
        vehicles: vehicles.length,
        items: items.length,
        done: items.filter((i) => i.status === "done").length,
        changes_requested: items.filter((i) => i.status === "changes_requested").length,
        blocked: items.filter((i) => i.status === "blocked").length,
        needs_review: items.filter((i) => i.status === "needs_review").length,
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write the batch to Busabase.");
    return;
  }

  await Promise.all(
    vehicles.map((vehicle) =>
      upsert(
        client,
        vehiclesBase,
        "vehicle-id",
        vehicle.vehicle_id,
        existingVehicles,
        {
          vehicle_id: vehicle.vehicle_id,
          name: vehicle.name,
          vehicle_type: vehicle.vehicle_type,
          origination_entity: vehicle.origination_entity,
          fund_manager_entity: vehicle.fund_manager_entity,
          listing_venue: vehicle.listing_venue,
          base_currency: vehicle.base_currency,
          target_close_date: vehicle.target_close_date,
        },
        `Generate batch ${batchId}: seed vehicle ${vehicle.vehicle_id}`,
      ),
    ),
  );

  await Promise.all(
    items.map((item) =>
      upsert(
        client,
        itemsBase,
        "item-id",
        item.id,
        existingItems,
        {
          item_id: item.id,
          vehicle_id: item.vehicle_id,
          role: item.role,
          item_key: item.item_key,
          title: item.title,
          summary: item.summary,
          body: item.body,
          category: item.category,
          proposed_action: item.proposed_action,
          reason: item.reason,
          reconciliation: item.reconciliation ? JSON.stringify(item.reconciliation) : "",
          decision_action: item.decision?.action || "",
          decision_comment: item.decision?.comment || "",
          decided_at: item.decision?.decided_at || "",
          override_reconciliation: "",
          execution_status: "",
          execution_detail: "",
          executed_at: "",
        },
        `Generate batch ${batchId}: seed item ${item.id}`,
      ),
    ),
  );

  await upsert(
    client,
    settingsBase,
    "record-id",
    "run",
    existingSettings,
    {
      record_id: "run",
      kind: "run",
      payload: JSON.stringify({ batch_id: batchId, generated_at: now }),
      updated_at: now,
    },
    `Generate batch ${batchId}: run metadata`,
  );

  const hasConfigRow = existingSettings.some((row) => row.kind === "config");
  if (!hasConfigRow) {
    await upsert(
      client,
      settingsBase,
      "record-id",
      "config",
      existingSettings,
      {
        record_id: "config",
        kind: "config",
        payload: JSON.stringify({ reviewer_name: "Unassigned reviewer" }),
        updated_at: now,
      },
      `Generate batch ${batchId}: seed default config`,
    );
  }

  console.log(`Wrote ${vehicles.length} vehicles / ${items.length} items to Busabase for batch ${batchId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
