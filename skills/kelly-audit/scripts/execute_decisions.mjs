#!/usr/bin/env node
// Trusted hand-off step. Kelly Audit's AirApp only ever proposes a review
// decision on an anomaly (approve / request changes / block / dismiss);
// this script is the process authorized to act on an `approved` verdict.
// It performs NO external side effects — it never sends a chasing email,
// never reissues an invoice, never touches ERP/bookkeeping records. This
// mirrors the retired scripts/execute_decisions.ts exactly: it only ever
// wrote execution_report.json entries (status "planned"/"ready_for_agent")
// and NEVER flipped an anomaly's workflow `status` to "done" itself — the
// real follow-up (chase_receivable/reissue_invoice/flag_to_accountant) is
// performed by the agent OUTSIDE the app (e.g. via kelly-email) only after
// explicit user approval, and the real result is recorded back onto the
// anomaly afterward.
//
// planExecution is ported verbatim from the retired
// scripts/execute_decisions.ts. There is no separate execution_report.json
// bucket in the Busabase-only shape (Busabase reads are always live) — the
// plan is written directly onto each anomaly's own execution_* fields,
// matching the review-workflow pattern used across this batch of skills.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every approved anomaly.
//   node scripts/execute_decisions.mjs --apply       Write execution_status="ready_for_agent" onto each
//                                                     approved anomaly. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { planExecution } from "../content/kelly-audit-app/app/js/audit-model.js";
import { appConfig } from "../content/kelly-audit-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads anomalies with status "approved" from Busabase. Without --apply this is
a dry run that only prints the planned follow-up operation
(chase_receivable / reissue_invoice / flag_to_accountant) for each. With
--apply it writes an execution marker (execution-status: "ready_for_agent",
operation, target, detail) back onto each approved anomaly — it performs no
send, no invoice reissue, no ERP mutation itself, and never changes the
anomaly's workflow status. The agent performs the real follow-up outside the
app after this report, then records the real result on the anomaly.`);
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
function baseAnomalyFields(row) {
  return {
    anomaly_id: row.anomaly_id,
    ref: row.ref,
    rule: row.rule,
    severity: row.severity,
    status: row.status,
    title: row.title,
    customer: row.customer || "",
    amount_at_stake: row.amount_at_stake,
    currency: row.currency || "USD",
    aging_bucket: row.aging_bucket || "",
    reason: row.reason || "",
    evidence: row.evidence || "",
    proposed_action: row.proposed_action || "",
    draft: row.draft || "",
    agent_notes: row.agent_notes || "",
    created_at: row.created_at || "",
    resolved_at: row.resolved_at || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  };
}

function parseEvidence(value) {
  try {
    return value ? JSON.parse(value) : { rows: [], computed: "" };
  } catch {
    return { rows: [], computed: "" };
  }
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
    throw new Error("Kelly Audit Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "anomalies");

  const rows = await readAll(client, declared);
  const approved = rows.filter((row) => row.status === "approved");

  if (!approved.length) {
    console.log("No approved anomalies to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of approved) {
    const anomaly = {
      rule: row.rule,
      customer: row.customer || "",
      evidence: parseEvidence(row.evidence),
    };
    const plan = planExecution(anomaly, { apply, hasEditedDraft: Boolean(row.decision_action) });
    console.log(`  Anomaly #${row.ref} -> ${plan.operation} (${plan.status}) target=${plan.target || "-"}`);
    console.log(`    ${plan.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseAnomalyFields(row),
          execution_status: plan.status,
          execution_operation: plan.operation,
          execution_target: plan.target,
          execution_detail: plan.detail,
          executed_at: now,
          // Workflow status is deliberately left unchanged — the agent's real
          // follow-up outside the app, not this script, ultimately resolves
          // the anomaly (see SKILL.md's Boundary section).
        }),
        message: `Record execution plan for anomaly ${row.anomaly_id}: ${plan.operation}`,
        author: "kelly-audit-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(
      `Dry run only (${approved.length} anomal${approved.length === 1 ? "y" : "ies"}). Re-run with --apply to record execution markers.`,
    );
    return;
  }
  console.log(
    "Recorded execution markers on each approved anomaly. No external side effects either way — the agent performs the real follow-up outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
