#!/usr/bin/env node
// Trusted hand-off step. Kelly Finance's AirApp only ever records a
// reviewer's decision (approve / request_changes / block / dismiss) on a
// model check; this script performs NO external side effect — it never
// exports, sends, or transmits a workbook to investors, and never mutates a
// source-of-truth accounting/ERP system. This mirrors the retired
// scripts/execute_decisions.ts exactly: it only ever reported which checks
// are approved and ready for the agent's next step ("written") vs still
// awaiting a human decision ("skipped"), and NEVER changed a check's
// workflow status itself. There is no separate execution_report.json bucket
// in the Busabase-only shape (Busabase reads are always live) — the report
// is written directly onto each check's own execution-* fields, matching the
// execution-marker pattern used by kelly-disclosure-tracker/kelly-deal-scorer.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the settled/pending report for every check.
//   node scripts/execute_decisions.mjs --apply       Write execution-status/execution-detail/executed-at onto
//                                                     every approved check. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { computeCheckFromRow } from "../app/app/js/finance-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Re-reads every model check from Busabase and reports which are approved and
ready for the agent's next step ("written": status approved) vs still
awaiting a human decision or already actioned some other way ("skipped":
needs_review, changes_requested, blocked, or done). Without --apply this is
a dry run that only prints the report. With --apply it writes an execution
marker (execution-status, execution-detail, executed-at) back onto every
approved check — it performs no export, filing, or external transmission,
and never changes a check's workflow status itself.`);
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

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseCheckFields(row) {
  return {
    check_id: row.check_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    check_type: row.check_type,
    evidence: row.evidence || "",
    proposed_action: row.proposed_action,
    draft: row.draft || "",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
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
    throw new Error("Kelly Finance Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const checksBase = resources.bases.find((base) => base.key === "checks");
  const rows = await readAll(client, checksBase);

  const now = new Date().toISOString();
  const results = [];
  for (const row of rows) {
    const check = computeCheckFromRow(row);
    // "written" means approved and ready for the agent's next step. Every
    // other status is "skipped" — still awaiting a decision (needs_review/
    // changes_requested), already blocked, or already dismissed (done).
    // Ported verbatim in spirit from the retired scripts/execute_decisions.ts,
    // which only ever handed off `approved` checks as operations.
    const status = check.status === "approved" ? "written" : "skipped";
    const operation = check.check_type === "model_quality" ? "revise_model_structure" : "record_model_review";
    const detail =
      status === "written"
        ? `Ready for agent: ${operation} (${check.proposed_action || "no action noted"}).`
        : `Not settled (status: ${check.status}); no agent hand-off yet.`;
    results.push({ check_id: check.id, status, operation, detail });

    if (apply && status === "written") {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseCheckFields(row),
          execution_status: status,
          execution_detail: detail,
          executed_at: now,
        }),
        message: `Record execution report for check ${check.id}: ${status}`,
        author: "kelly-finance-executor",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  const written = results.filter((r) => r.status === "written").length;
  console.log(JSON.stringify({ generated_at: now, dry_run: !apply, results }, null, 2));
  console.log(`${written}/${results.length} approved checks ready for the agent.`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to record execution markers on each approved check.");
  } else {
    console.log(
      "Recorded execution markers on every approved check. No external side effects either way — this script never exports or files anything.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
