#!/usr/bin/env node
// Trusted hand-off step. Kelly Disclosure Tracker's AirApp only ever records
// a reviewer's decision (verified / needs_source / flagged) on a disclosure
// item; this script performs NO external side effect — it never files,
// submits, or transmits anything to a real regulator, fund administrator, or
// exchange. This mirrors the retired scripts/execute_decisions.ts exactly:
// it only ever reported which items are settled ("written": verified/done or
// flagged/blocked) vs still awaiting a human decision ("skipped": needs
// review or awaiting a source document), and NEVER changed an item's
// workflow status itself. There is no separate execution_report.json bucket
// in the Busabase-only shape (Busabase reads are always live) — the report
// is written directly onto each item's own execution-* fields, matching the
// execution-marker pattern used by kelly-deal-scorer/kelly-audit.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the settled/pending report for every item.
//   node scripts/execute_decisions.mjs --apply       Write execution-status/execution-detail/executed-at onto
//                                                     every item. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { computeItemFromRow } from "../app/app/js/tracker-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Re-reads every disclosure item from Busabase and reports which are settled
("written": status done/verified or blocked/flagged) vs still awaiting a
human decision ("skipped": needs_review or changes_requested/awaiting a
source document). Without --apply this is a dry run that only prints the
report. With --apply it writes an execution marker (execution-status,
execution-detail, executed-at) back onto every item — it performs no filing,
submission, or external transmission, and never changes an item's workflow
status itself.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseItemFields(row) {
  return {
    item_id: row.item_id,
    vehicle_id: row.vehicle_id,
    role: row.role,
    item_key: row.item_key,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    proposed_action: row.proposed_action,
    reason: row.reason,
    reconciliation: row.reconciliation || "",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    override_reconciliation: row.override_reconciliation || "",
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");

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
  const itemsBase = resources.bases.find((base) => base.key === "items");
  const rows = await readAll(client, itemsBase);

  const now = new Date().toISOString();
  const results = [];
  for (const row of rows) {
    const item = computeItemFromRow(row);
    // "written" means settled: verified (done) or flagged (blocked, escalated).
    // "changes_requested" items are still waiting on a source document and
    // must not be reported as written even though a decision exists. Ported
    // verbatim from the retired scripts/execute_decisions.ts.
    const status = item.status === "done" || item.status === "blocked" ? "written" : "skipped";
    const detail =
      item.status === "needs_review"
        ? "No reviewer decision yet."
        : item.status === "changes_requested"
          ? `Awaiting source document (${item.decision?.action ?? "n/a"}); not yet settled.`
          : `Recorded as ${item.status} (${item.decision?.action ?? "n/a"}).`;
    results.push({ item_id: item.id, status, detail });

    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseItemFields(row),
          execution_status: status,
          execution_detail: detail,
          executed_at: now,
        }),
        message: `Record execution report for item ${item.id}: ${status}`,
        author: "kelly-disclosure-tracker-executor",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  const written = results.filter((r) => r.status === "written").length;
  console.log(JSON.stringify({ generated_at: now, dry_run: !apply, results }, null, 2));
  console.log(`${written}/${results.length} items settled.`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to record execution markers on each item.");
  } else {
    console.log(
      "Recorded execution markers on every item. No external side effects either way — this tracker never files anything.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
