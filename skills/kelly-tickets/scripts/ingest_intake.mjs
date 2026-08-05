#!/usr/bin/env node
// Trusted hand-off step. Kelly Tickets' AirApp never imports complaint
// channel exports itself — the browser cannot read an arbitrary local file
// path. The agent parses WeChat group exports, phone-call logs, front-desk
// forms, and mailbox items into the payload shape documented in
// references/tickets-schema.md; this script validates, dedupes (channel +
// external_id, falling back to a content hash), masks contacts defensively,
// and writes new rows straight into the Intake Base. It appends an entry to
// the Sync Log Base per file with added/skipped counts. It performs no other
// external effect.
//
// sha1/dedupeKey/maskContact-driven validation is ported verbatim from the
// retired scripts/ingest_intake.ts; only the write target changed, from a
// persisted app/.data/tickets_snapshot.json to Busabase's intake/sync_log
// Bases.
//
// Usage:
//   node scripts/ingest_intake.mjs <payload.json> [more-payloads.json...] [--apply]
//
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { maskContact } from "../app/app/js/tickets-model.js";

const CHANNELS = new Set(["wechat", "phone", "form", "email", "walk_in"]);
const URGENCIES = new Set(["urgent", "high", "normal", "low"]);

function help() {
  console.log(`Usage: node scripts/ingest_intake.mjs <payload.json> [more-payloads.json...] [--apply]

Parses complaint intake payloads ({ source, items: [] }, see
references/tickets-schema.md), dedupes against the Intake Base by
channel+external_id (falling back to a content hash), masks contacts, and
writes new rows into Busabase. Appends a Sync Log entry per file. Without
--apply this is a dry run that only prints what would be written.`);
}

/** @returns {never} */
function fail(message) {
  console.error(`kelly-tickets ingest: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

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
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadFiles = argv.filter((arg) => !arg.startsWith("--"));
  if (!payloadFiles.length) return help();

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Tickets Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const existingIntake = await readAll(client, declared("intake"));
  const dedupeKey = (item) => {
    const hash = item.content_hash || sha1(`${item.channel}|${item.unit || ""}|${item.text}`);
    return `${item.channel}:${item.external_id || hash}`;
  };
  const seen = new Set(existingIntake.map(dedupeKey));

  let totalAdded = 0;
  let totalSkipped = 0;
  const now = new Date().toISOString();

  for (const file of payloadFiles) {
    const payload = JSON.parse(
      await readFile(file, "utf8").catch((error) => fail(`cannot read ${file}: ${error.message}`)),
    );
    if (!payload || !Array.isArray(payload.items)) fail(`${file} must contain an { items: [] } payload`);
    let fileAdded = 0;
    let fileSkipped = 0;
    for (const [index, item] of payload.items.entries()) {
      const path = `${file} items[${index}]`;
      if (!CHANNELS.has(item.channel)) fail(`${path}: invalid channel ${item.channel}`);
      if (typeof item.text !== "string" || !item.text.trim()) fail(`${path}: text is required`);
      if (typeof item.received_at !== "string" || Number.isNaN(Date.parse(item.received_at))) {
        fail(`${path}: received_at must be an ISO timestamp`);
      }
      const contentHash = sha1(`${item.channel}|${item.unit || ""}|${item.text.trim()}`);
      const key = `${item.channel}:${item.external_id || contentHash}`;
      if (seen.has(key)) {
        fileSkipped += 1;
        continue;
      }
      seen.add(key);
      const fields = {
        intake_id: `in-${contentHash.slice(0, 10)}`,
        channel: item.channel,
        external_id: String(item.external_id || ""),
        content_hash: contentHash,
        reporter: String(item.reporter || ""),
        contact_masked: maskContact(item.contact || item.contact_masked || ""),
        unit: String(item.unit || ""),
        location: String(item.location || ""),
        text: item.text.trim(),
        received_at: new Date(item.received_at).toISOString(),
        urgency_guess: URGENCIES.has(item.urgency_guess) ? item.urgency_guess : "normal",
        category_guess: String(item.category_guess || "other"),
        triage_state: "new",
        ticket_id: "",
        attachments_note: String(item.attachments_note || ""),
        decision_action: "",
        decision_note: "",
        decision_fields: "",
        decided_at: "",
      };
      console.log(`  ${apply ? "write" : "would write"} intake ${fields.intake_id} [${fields.channel}]`);
      if (apply) {
        await client.bases.createChangeRequest({
          baseId: declared("intake").baseId,
          fields: toBusabaseFields(fields),
          message: `Ingest intake ${fields.intake_id}`,
          submittedBy: "kelly-tickets-ingest",
          autoMerge: true,
        });
      }
      fileAdded += 1;
    }
    totalAdded += fileAdded;
    totalSkipped += fileSkipped;
    const logId = `log-${now.replace(/[-:TZ.]/g, "").slice(0, 14)}-${sha1(file).slice(0, 6)}`;
    if (apply) {
      await client.bases.createChangeRequest({
        baseId: declared("sync_log").baseId,
        fields: toBusabaseFields({
          log_id: logId,
          at: now,
          source: String(payload.source || "ingest"),
          action: "ingest",
          detail: `Ingested ${fileAdded} new intake items from ${file}; skipped ${fileSkipped} duplicates.`,
          count: fileAdded,
        }),
        message: `Sync log ${logId}`,
        submittedBy: "kelly-tickets-ingest",
        autoMerge: true,
      });
    }
  }

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase intake Base`);
  console.log(`  intake: +${totalAdded} added, ${totalSkipped} duplicates skipped`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
  else console.log("Next: node scripts/apply_triage.mjs <payload.json> to classify and propose dispatches.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
