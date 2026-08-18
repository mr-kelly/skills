#!/usr/bin/env node
// Dry-run-by-default execution stub, ported from the retired
// scripts/execute_decisions.ts. Reports the concrete external-handoff
// operation implied by each decided signal/action/draft's verdict
// (operationForDecision(), ported verbatim from the retired script's
// channel/next_step/plain-signal branch) and, with --apply, marks every
// approved item "done" once the agent has actually performed that handoff
// somewhere outside this script — never inside it. This script never posts
// content, sends a message, mutates a CRM, or spends money; it only prints
// the plan (default) or records that the human-approved handoff already
// happened (--apply), matching the retired script's exact safety boundary
// (see SKILL.md's Boundary section). request_changes/block verdicts are
// left exactly as decided — already a terminal review state — so there is
// nothing further for this script to do for them.
//
// Usage:
//   node scripts/execute_decisions.mjs            Dry-run: print the plan for every decided item.
//   node scripts/execute_decisions.mjs --apply     After the agent has performed the approved handoffs,
//                                                    mark those signals/actions/drafts done.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { operationForDecision } from "../app/app/js/retail-model.js";

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

async function markDone(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-retail-intel-execute-decisions",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

const KIND_TABLES = [
  { kind: "signal", baseKey: "signals", idField: "signal_id" },
  { kind: "action", baseKey: "actions", idField: "action_id" },
  { kind: "draft", baseKey: "drafts", idField: "draft_id" },
];

async function main() {
  const apply = process.argv.includes("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Retail Intel Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const rowsByKind = Object.fromEntries(
    await Promise.all(KIND_TABLES.map(async (table) => [table.kind, await readAll(client, declared(table.baseKey))])),
  );

  /** @type {Array<{ kind: string, idField: string, record: Record<string, any>, planned: Record<string, any>, verdict: string }>} */
  const operations = [];
  for (const table of KIND_TABLES) {
    for (const item of rowsByKind[table.kind]) {
      if (!item.decision_verdict || item.status === "done") continue;
      const planned = operationForDecision(item, item.decision_verdict);
      if (!planned) continue;
      operations.push({
        kind: table.kind,
        idField: table.idField,
        record: item,
        planned,
        verdict: item.decision_verdict,
      });
    }
  }

  if (!operations.length) {
    console.log(
      "No decided items to plan. Approve, request changes on, or block a signal, action, or draft in the app first.",
    );
    return;
  }

  for (const op of operations) {
    console.log(`- [${op.kind}] ${op.verdict} -> ${op.planned.operation} -> ${op.planned.target || "(no target)"}`);
  }

  if (apply) {
    for (const op of operations) {
      // Only an "approve" verdict is a terminal handoff this script marks
      // done; request_changes/block are already the human's final word for
      // this round and need no further status change.
      if (op.verdict !== "approve") continue;
      const { __recordId, __headCommitId, ...fields } = op.record;
      await markDone(client, op.record, { ...fields, status: "done" }, `Mark ${op.kind} ${fields[op.idField]} done`);
    }
  }

  console.log(
    `${apply ? "APPLIED" : "DRY-RUN"}: ${operations.length} operations.${apply ? "" : " No changes applied. Re-run with --apply after the handoffs are performed."}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
