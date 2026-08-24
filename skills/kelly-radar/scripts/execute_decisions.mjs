#!/usr/bin/env node
// Dry-run-by-default execution stub, ported from the retired
// scripts/execute_decisions.ts. Turns approved signals/briefs/opportunities
// into concrete operations the agent must perform outside the app —
// operationForSignal/operationForBrief/operationForOpportunity are ported
// verbatim (same variable names, same order of operations) from the retired
// lib/data-provider/local-file-provider.ts's executeDecisions() loops. No
// external side effects: this script never posts to kelly-writer/
// kelly-feedback, never edits watchlist config, and never starts research
// itself — it only prints the plan (default) or, with --apply, marks the
// approved signal/opportunity status "done" after the agent has actually
// performed the handoff (matches the original stub's safety boundary
// exactly — see SKILL.md's Boundary section).
//
// Usage:
//   node scripts/execute_decisions.mjs            Dry-run: print the plan for every approved item.
//   node scripts/execute_decisions.mjs --apply     After the agent has performed the handoffs, mark the
//                                                    approved signals/opportunities done.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-radar-app/app/js/config.js";
import {
  operationForBrief,
  operationForOpportunity,
  operationForSignal,
} from "../content/kelly-radar-app/app/js/radar-model.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

async function markDone(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-radar-execute-decisions",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

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
    throw new Error("Kelly Radar Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [signals, briefs, questions, opportunities] = await Promise.all([
    readAll(client, declared("signals")),
    readAll(client, declared("briefs")),
    readAll(client, declared("questions")),
    readAll(client, declared("opportunities")),
  ]);
  const questionById = new Map(questions.map((question) => [question.question_id, question]));

  /** @type {Array<{ kind: string, record: Record<string, any>, base: string, planned: Record<string, any> }>} */
  const operations = [];

  for (const signal of signals) {
    if (signal.status !== "approved" || signal.decision_verdict !== "approve") continue;
    const planned = operationForSignal({ ...signal, handoff: parseJsonValue(signal.handoff, null) });
    operations.push({ kind: "signal", record: signal, base: "signals", planned });
  }

  for (const brief of briefs) {
    if (brief.status !== "approved" || brief.decision_verdict !== "approve") continue;
    const question = questionById.get(brief.question_id);
    if (!question || !["brief_needs_review", "researching"].includes(question.status)) continue;
    const planned = operationForBrief(brief, question);
    operations.push({ kind: "brief", record: brief, base: "briefs", planned });
  }

  for (const opportunity of opportunities) {
    if (opportunity.status !== "approved" || opportunity.decision_verdict !== "approve") continue;
    const planned = operationForOpportunity({
      ...opportunity,
      proposed_next_step: parseJsonValue(opportunity.proposed_next_step, {}),
    });
    operations.push({ kind: "opportunity", record: opportunity, base: "opportunities", planned });
  }

  if (!operations.length) {
    console.log("No approved items to plan. Approve signals, briefs, or opportunities in the app first.");
    return;
  }

  for (const op of operations) {
    console.log(
      `- [${op.kind}] ${op.planned.operation} → ${op.planned.target || "(no target)"} :: ${op.planned.summary}`,
    );
  }

  if (apply) {
    const now = new Date().toISOString();
    for (const op of operations) {
      // Briefs stay "approved" — their lifecycle naturally advances when
      // file_report.mjs later files the report. Only signals and
      // opportunities are terminal handoffs, so only they get marked done.
      if (op.kind === "brief") continue;
      const { __recordId, __headCommitId, ...fields } = op.record;
      await markDone(
        client,
        op.record,
        { ...fields, status: "done" },
        `Mark ${op.kind} ${fields[`${op.kind}_id`]} done`,
      );
    }
    await client.bases.createChangeRequest({
      baseId: declared("sync-log").baseId,
      fields: toBusabaseFields({
        log_id: `log-${Date.now().toString(36)}`,
        at: now,
        actor: "kelly-radar-agent",
        action: "execute_decisions",
        detail: `${operations.length} approved operations recorded as executed handoffs.`,
      }),
      message: "Execute decisions sync log",
      submittedBy: "kelly-radar-execute-decisions",
      autoMerge: true,
    });
  }

  console.log(
    `${apply ? "APPLIED" : "DRY-RUN"}: ${operations.length} operations.${apply ? "" : " No changes applied. Re-run with --apply after the handoffs are performed."}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
