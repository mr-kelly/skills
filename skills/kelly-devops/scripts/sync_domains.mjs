#!/usr/bin/env node
// Domain expiry sync via RDAP (https://rdap.org/domain/<name>) — the AirApp
// browser cannot make this outbound lookup itself. rdapExpiration is ported
// verbatim from the retired scripts/sync_domains.ts; only the write target
// changed, from content/kelly-devops-app/.data/ops_snapshot.json to Busabase's Expiries Base.
//
// The domain roster (registrar, auto-renew) used to live in config.local.json;
// in the Busabase-only shape the roster IS the Expiries Base row itself
// (type=domain rows carry registrar/auto_renew alongside the live RDAP
// result). To register a NEW domain, pass a roster JSON file — domains
// already in Busabase are always re-checked whether or not a roster file is
// given:
//
//   node scripts/sync_domains.mjs [roster.json] [--apply]
//
// roster.json shape:
// { "domains": [{ "domain": "formkit.io", "product": "FormKit", "registrar": "Namecheap", "auto_renew": false }] }
//
// Fails gracefully per domain. Without --apply this is a dry run. Connects
// with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-devops-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/sync_domains.mjs [roster.json] [--apply]

Re-checks every domain already registered in Busabase's Expiries Base (type
domain) via RDAP. Pass a roster JSON file to register NEW domains at the
same time. Without --apply this is a dry run.`);
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
      author: "kelly-devops-sync-domains",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-devops-sync-domains",
    autoMerge: true,
  });
  return "created";
}

function expiryIdFor(domain) {
  return `domain-${domain.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

// Ported verbatim from the retired scripts/sync_domains.ts.
async function rdapExpiration(domain) {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { accept: "application/rdap+json, application/json", "user-agent": "kelly-devops-check/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RDAP responded HTTP ${res.status}`);
  const body = await res.json();
  const event = (body.events || []).find((item) => item.eventAction === "expiration");
  if (!event?.eventDate) throw new Error("RDAP response has no expiration event");
  return new Date(event.eventDate);
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
  if (flags.has("--help") || flags.has("-h")) return help();
  const apply = flags.has("--apply");
  const rosterPath = args[0];

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

  const roster = rosterPath ? JSON.parse(await readFile(rosterPath, "utf8")) : {};
  const rosterDomains = Array.isArray(roster.domains) ? roster.domains : [];

  const expiryRows = await readAll(client, declared("expiries"));
  const byExpiryId = new Map(expiryRows.filter((row) => row.type === "domain").map((row) => [row.expiry_id, row]));
  for (const entry of rosterDomains) {
    const domain = String(entry.domain || "").trim();
    if (!domain) continue;
    const expiryId = expiryIdFor(domain);
    if (byExpiryId.has(expiryId)) continue;
    byExpiryId.set(expiryId, {
      expiry_id: expiryId,
      type: "domain",
      item: domain,
      product: entry.product || "",
      registrar: entry.registrar || "",
      auto_renew: entry.auto_renew ? "true" : "false",
    });
  }

  const targets = [...byExpiryId.values()];
  if (!targets.length) {
    console.log("No domains registered yet. Pass a roster JSON file with domains[] to register one.");
    return;
  }

  const now = new Date().toISOString();
  let failures = 0;
  let soonest = null;

  for (const row of targets) {
    const domain = row.item;
    try {
      const expires = await rdapExpiration(domain);
      const expiresOn = expires.toISOString().slice(0, 10);
      const daysLeft = Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const autoRenew = row.auto_renew === true || row.auto_renew === "true";
      const fields = {
        expiry_id: row.expiry_id,
        type: "domain",
        item: domain,
        product: row.product || "",
        expires_on: expiresOn,
        auto_renew: autoRenew ? "true" : "false",
        registrar: row.registrar || "",
        source: "rdap",
        detail: autoRenew
          ? `Auto-renew is on${row.registrar ? ` at ${row.registrar}` : ""}. Confirm the payment method stays valid.`
          : `Auto-renew is off. Renew ${domain}${row.registrar ? ` at ${row.registrar}` : ""} before ${expiresOn}.`,
        updated_at: now,
      };
      const outcome = await upsertRow(
        client,
        declared("expiries"),
        row.__recordId ? row : null,
        "expiry-id",
        row.expiry_id,
        fields,
        `Domain expiry for ${domain}`,
        apply,
      );
      if (soonest === null || daysLeft < soonest.daysLeft) soonest = { domain, daysLeft };
      console.log(`${apply ? outcome : "would upsert"} ${domain}: expires ${expiresOn} (${daysLeft} days)`);
    } catch (error) {
      failures += 1;
      console.log(`- ${domain}: RDAP lookup failed (${error.message}); keeping previous data if any.`);
      if (!row.__recordId) {
        const fields = {
          expiry_id: row.expiry_id,
          type: "domain",
          item: domain,
          product: row.product || "",
          expires_on: "",
          auto_renew: row.auto_renew === true || row.auto_renew === "true" ? "true" : "false",
          registrar: row.registrar || "",
          source: "rdap",
          detail: `RDAP lookup failed: ${error.message}. Verify the domain manually at the registrar.`,
          updated_at: now,
        };
        await upsertRow(
          client,
          declared("expiries"),
          null,
          "expiry-id",
          row.expiry_id,
          fields,
          `Register ${domain} (RDAP failed)`,
          apply,
        );
      }
    }
  }

  const event = {
    event_id: `evt-domain-check-${Date.now()}`,
    at: now,
    severity: failures ? "warning" : "info",
    kind: "expiry",
    message: soonest
      ? `Domain check completed: soonest expiry is ${soonest.domain} in ${soonest.daysLeft} days.${failures ? ` ${failures} lookup(s) failed.` : ""}`
      : `Domain check completed with ${failures} failed lookup(s).`,
    service_id: "",
  };
  const outcome = await upsertRow(
    client,
    declared("events"),
    null,
    "event-id",
    event.event_id,
    event,
    `Event ${event.event_id}`,
    apply,
  );
  console.log(`${apply ? outcome : "would log"} event: ${event.message}`);

  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
