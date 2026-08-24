#!/usr/bin/env node
// Trusted hand-off step. Kelly Lesson's AirApp only ever proposes a review
// decision on a plan (approve / request changes / block / revise); this
// script is the process authorized to act on that decision. It performs NO
// external side effects — it never sends the feedback draft to a teacher,
// never publishes anything itself. This mirrors the retired
// scripts/execute_decisions.ts exactly: it only ever recorded planned
// operations ("planned"/"ready_for_agent") and NEVER flipped a plan's
// workflow `status` itself — the real follow-up (export the Markdown via
// scripts/export_plans.mjs, send the feedback draft via other channels e.g.
// kelly-email) is performed by the agent OUTSIDE the app only after explicit
// user approval, matching SKILL.md's Boundary section.
//
// planExecution is ported/adapted from the retired scripts/execute_decisions.ts
// (content/kelly-lesson-app/app/js/lesson-model.js's doc comment explains the adaptation: one
// execution marker directly on the plan record instead of a separate
// execution_report.json list).
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every decided plan.
//   node scripts/execute_decisions.mjs --apply       Write execution_status="ready_for_agent" onto each
//                                                     approved/changes-requested plan. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-lesson-app/app/js/config.js";
import { planExecution } from "../content/kelly-lesson-app/app/js/lesson-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads plans with decision_action "approve" or "request_changes" from
Busabase. Without --apply this is a dry run that only prints the planned
follow-up operation (publish_plan / request_revision) for each. With --apply
it writes an execution marker (execution-status: "ready_for_agent",
operation, target, detail) back onto each plan — it performs no export, no
teacher message, no ERP/document mutation itself, and never changes the
plan's workflow status. The agent performs the real follow-up outside the
app after this report (scripts/export_plans.mjs, then send the feedback
draft via other channels), then records the real result on the plan.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function basePlanFields(row) {
  return {
    plan_id: row.plan_id,
    ref: row.ref,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    unit: row.unit || "",
    teacher_id: row.teacher_id || "",
    source: row.source || "agent_draft",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    class_length_minutes: row.class_length_minutes,
    duration_minutes: row.duration_minutes,
    objectives: row.objectives || "",
    key_points: row.key_points || "",
    difficulties: row.difficulties || "",
    materials: row.materials || "",
    curriculum_refs: row.curriculum_refs || "",
    board_plan: row.board_plan || "",
    homework: row.homework || "",
    reflection: row.reflection || "",
    safety_notes: row.safety_notes || "",
    stages: row.stages || "",
    notes: row.notes || "",
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "",
    feedback_draft: row.feedback_draft || "",
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
    throw new Error("Kelly Lesson Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "plans");

  const rows = await readAll(client, declared);
  const decided = rows.filter((row) => row.decision_action === "approve" || row.decision_action === "request_changes");

  if (!decided.length) {
    console.log("No approved or changes-requested plans to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of decided) {
    const plan = {
      plan_id: row.plan_id,
      grade: row.grade,
      subject: row.subject,
      title: row.title,
      teacher_id: row.teacher_id,
      feedback_draft: row.feedback_draft || "",
    };
    const decision = { action: row.decision_action, draft: row.feedback_draft || "" };
    const plan_execution = planExecution(plan, decision, { apply });
    if (!plan_execution) continue;
    console.log(
      `  Plan #${row.ref} (${row.plan_id}) -> ${plan_execution.operation} (${plan_execution.status}) target=${plan_execution.target}`,
    );
    console.log(`    ${plan_execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...basePlanFields(row),
          execution_status: plan_execution.status,
          execution_operation: plan_execution.operation,
          execution_target: plan_execution.target,
          execution_detail: plan_execution.detail,
          executed_at: now,
          // Workflow status is deliberately left unchanged — the agent's real
          // follow-up outside the app, not this script, ultimately resolves
          // the plan (see SKILL.md's Boundary section).
        }),
        message: `Record execution plan for ${row.plan_id}: ${plan_execution.operation}`,
        author: "kelly-lesson-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(`Dry run only (${decided.length} plan(s)). Re-run with --apply to record execution markers.`);
    return;
  }
  console.log(
    "Recorded execution markers on each decided plan. No external side effects either way — the agent performs the real follow-up outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
