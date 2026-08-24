#!/usr/bin/env node
// Trusted hand-off step. Legal Casebase Ingest's AirApp only ever proposes a
// review decision on a case record (approve / request changes / revise /
// block); this script is the process authorized to act on that decision. It
// performs NO external side effects — it never publishes a case record,
// notifies downstream skills, or files anything itself. This mirrors
// kelly-legal-contracts' execute_decisions.mjs precedent: it only ever
// records a planned operation ("planned"/"ready_for_agent") and NEVER flips
// an item's workflow `status` itself, unlike the retired
// scripts/execute_decisions.ts (which set status="done" directly on
// --apply) — the real follow-up (export the case record via
// scripts/export_case_records.mjs, then let precedent desk / firm radar
// consume it) is performed by the agent OUTSIDE the app only after explicit
// human approval, matching SKILL.md's Boundary section.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every decided item.
//   node scripts/execute_decisions.mjs --apply       Write execution-status="ready_for_agent" onto each
//                                                     approved/changes-requested item. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { itemExecution, normalizeItemRow } from "../content/kelly-legal-casebase-ingest-app/app/js/casebase-model.js";
import { appConfig } from "../content/kelly-legal-casebase-ingest-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads items with decision-action "approve" or "request_changes" from
Busabase. Without --apply this is a dry run that only prints the planned
follow-up operation (export_case_record / request_revision) for each. With
--apply it writes an execution marker (execution-status: "ready_for_agent",
operation, target, detail) back onto each item — it performs no export, no
downstream notification, no filing itself, and never changes the item's
workflow status. The agent performs the real follow-up outside the app after
this report (scripts/export_case_records.mjs), then records the real result.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseItemFields(row) {
  return {
    item_id: row.item_id,
    ref: row.ref || "",
    title: row.title || "",
    category: row.category || "",
    status: row.status || "needs_review",
    owner: row.owner || "",
    risk: row.risk || "[]",
    summary: row.summary || "",
    body: row.body || "",
    recommendation: row.recommendation || "",
    proposed_action: row.proposed_action || "",
    draft: row.draft || "",
    evidence: row.evidence || "[]",
    cause: row.cause || "",
    court: row.court || "",
    procedure: row.procedure || "",
    outcome: row.outcome || "",
    paragraphs: row.paragraphs || "[]",
    extraction_confidence: row.extraction_confidence ?? "",
    duplicate_score: row.duplicate_score ?? "",
    ingest_bucket: row.ingest_bucket || "",
    pii_cleared: row.pii_cleared || "",
    parties_redacted: row.parties_redacted || "",
    contacts_redacted: row.contacts_redacted || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

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
    throw new Error("Legal Casebase Ingest Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "items");

  const rows = await readAll(client, declared);
  const decided = rows.filter((row) => row.decision_action === "approve" || row.decision_action === "request_changes");

  if (!decided.length) {
    console.log("No approved or changes-requested case records to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of decided) {
    const item = normalizeItemRow(row);
    const execution = itemExecution(item, row.decision_action, { apply });
    if (!execution) continue;
    console.log(
      `  ${item.ref} (${item.id}) -> ${execution.operation} (${execution.status}) target=${execution.target}`,
    );
    console.log(`    ${execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseItemFields(row),
          execution_status: execution.status,
          execution_operation: execution.operation,
          execution_target: execution.target,
          execution_detail: execution.detail,
          executed_at: now,
          // Workflow status is deliberately left unchanged — the agent's real
          // follow-up outside the app, not this script, ultimately resolves
          // the item (see SKILL.md's Boundary section).
        }),
        message: `Record execution plan for ${item.id}: ${execution.operation}`,
        author: "kelly-legal-casebase-ingest-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(`Dry run only (${decided.length} item(s)). Re-run with --apply to record execution markers.`);
    return;
  }
  console.log(
    "Recorded execution markers on each decided item. No external side effects either way — the agent performs the real follow-up outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
