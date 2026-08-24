#!/usr/bin/env node
// Trusted hand-off step. Kelly Ads' AirApp only ever proposes a review
// decision on an adjustment card (approve / request changes / block / note);
// this script is the process authorized to plan what happens next for an
// `approved` card. It performs NO external side effects — it never calls an
// Amazon/Meta/TikTok/Google Ads API, never actually changes a bid, budget,
// keyword, or creative. This mirrors the retired scripts/execute_decisions.ts
// exactly: it only ever wrote execution_report.json entries with
// `dry_run: true` and `handoff_to_agent: true`, and NEVER flipped an
// adjustment's workflow `status` to "done" itself — the real mutation is
// performed by the agent OUTSIDE the app via the platform APIs with the
// user's credentials, only after explicit approval, and the real result
// (an `execution` record) is recorded back onto the adjustment afterward by
// the agent, not by this script.
//
// operationFor is ported verbatim from the retired
// scripts/execute_decisions.ts. There is no separate execution_report.json
// bucket in the Busabase-only shape (Busabase reads are always live) — the
// plan is written directly onto each adjustment's own execution_* fields,
// matching the review-workflow pattern used across this batch of skills.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every approved adjustment.
//   node scripts/execute_decisions.mjs --apply       Write execution_status="planned" onto each
//                                                     approved adjustment. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { operationFor } from "../content/kelly-ads-app/app/js/ads-model.js";
import { appConfig } from "../content/kelly-ads-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads adjustments with status "approved" from Busabase. Without --apply this
is a dry run that only prints the planned operation (add_negative_keyword /
set_bid / pause_target / shift_budget / refresh_creative) for each. With
--apply it writes an execution marker (execution-status: "planned",
operation, target, detail, executed-at) back onto each approved adjustment
— it performs no bid/budget/keyword/creative mutation itself, and never
changes the adjustment's workflow status. The agent performs the real
mutation outside the app after this report via the platform APIs, then
records the real result on the adjustment.`);
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

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseAdjustmentFields(row) {
  return {
    adjustment_id: row.adjustment_id,
    ref: row.ref,
    type: row.type,
    title: row.title,
    status: row.status,
    campaign_id: row.campaign_id,
    platform: row.platform,
    reason: row.reason || "",
    evidence: row.evidence || "",
    target: row.target || "",
    current_value: row.current_value || "",
    proposed_value: row.proposed_value || "",
    expected_impact: row.expected_impact || "",
    anomaly_id: row.anomaly_id || "",
    note: row.note || "",
    created_at: row.created_at || "",
    decision_verdict: row.decision_verdict || "",
    decision_note: row.decision_note || "",
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
    throw new Error("Kelly Ads Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "adjustments");

  const rows = await readAll(client, declared);
  const approved = rows.filter((row) => row.status === "approved");

  if (!approved.length) {
    console.log("No approved adjustments to plan. Approve adjustment cards in the app first.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of approved) {
    const adjustment = {
      type: row.type,
      campaign_id: row.campaign_id,
      platform: row.platform,
      current_value: row.current_value || "",
      proposed_value: row.proposed_value || "",
      target: parseJsonValue(row.target, {}),
    };
    const plan = operationFor(adjustment);
    console.log(`  Adjustment #${row.ref} -> ${plan.operation}`);
    console.log(`    target: ${JSON.stringify(plan.target)}`);
    console.log(`    ${plan.note}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseAdjustmentFields(row),
          execution_status: "planned",
          execution_operation: plan.operation,
          execution_target: JSON.stringify(plan.target),
          execution_detail: plan.note,
          executed_at: now,
          // Workflow status is deliberately left unchanged — the agent's real
          // mutation outside the app, not this script, ultimately resolves
          // the adjustment to "done" (see SKILL.md's Boundary section).
        }),
        message: `Record execution plan for adjustment ${row.adjustment_id}: ${plan.operation}`,
        author: "kelly-ads-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(
      `Dry run only (${approved.length} adjustment${approved.length === 1 ? "" : "s"}). Re-run with --apply to record execution markers.`,
    );
    return;
  }
  console.log(
    "Recorded execution markers on each approved adjustment. No bid/budget/keyword/creative mutation either way — the agent performs the real mutation outside the app per SKILL.md, then records the result on the adjustment.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
