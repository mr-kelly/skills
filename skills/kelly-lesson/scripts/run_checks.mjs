#!/usr/bin/env node
// Trusted hand-off step. Re-reads plans + the compliance rules/template
// sections off Busabase's plans/settings Bases, evaluates every deterministic
// rule via app/app/js/lesson-model.js's evaluateCheck() (ported verbatim from
// the retired scripts/run_checks.ts), preserves agent-judged agent_review
// verdicts, upserts the Checks Base, and recomputes+writes each plan's
// compliance_score via computeComplianceScore() (same POINTS table as the
// retired script). Re-running is idempotent.
//
// Usage: node scripts/run_checks.mjs [--apply]
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { computeComplianceScore, evaluateCheck } from "../app/app/js/lesson-model.js";

function help() {
  console.log(`Usage: node scripts/run_checks.mjs [--apply]

Evaluates every deterministic compliance rule (section presence, stage count
and timing, duration sums, homework, measurable-verb heuristics, lab safety)
against every plan in Busabase, preserves agent-judged agent_review verdicts,
upserts the Checks Base, and recomputes each plan's compliance_score. Without
--apply this is a dry run.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-lesson-checks",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-lesson-checks",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");

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
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [plans, existingChecks, settingsRows] = await Promise.all([
    readAll(client, declared("plans")),
    readAll(client, declared("checks")),
    readAll(client, declared("settings")),
  ]);
  if (!plans.length) throw new Error("No plans found. Run scripts/ingest_plan.mjs first.");

  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const complianceRules = parseJsonValue(settings.compliance_rules, []);
  if (!complianceRules.length) throw new Error("No compliance_rules found on the Settings row.");
  const templateSections = parseJsonValue(settings.template_sections, []);
  const classLength = Number(settings.class_length_minutes) || 45;

  const existingByKey = new Map(existingChecks.map((row) => [`${row.plan_id}:${row.rule_id}`, row]));
  const checkWrites = [];
  let failCount = 0;
  let warnCount = 0;
  let pendingCount = 0;

  for (const row of plans) {
    const plan = {
      plan_id: row.plan_id,
      title: row.title,
      unit: row.unit,
      class_length_minutes: Number(row.class_length_minutes) || classLength,
      sections: {
        objectives: parseJsonValue(row.objectives, []),
        materials: parseJsonValue(row.materials, []),
        curriculum_refs: parseJsonValue(row.curriculum_refs, []),
        homework: row.homework || "",
        safety_notes: row.safety_notes || "",
        stages: parseJsonValue(row.stages, []),
      },
    };
    const planChecks = [];
    for (const rule of complianceRules) {
      const key = `${plan.plan_id}:${rule.rule_id}`;
      const existing = existingByKey.get(key);
      const [result, evidence] = evaluateCheck(rule, plan, { classLength, templateSections }, existing);
      if (result === "fail") failCount += 1;
      else if (result === "warn") warnCount += 1;
      else if (result === "agent_review") pendingCount += 1;
      const fields = {
        check_id: `chk-${plan.plan_id.replace(/^plan-/, "")}-${rule.rule_id}`,
        plan_id: plan.plan_id,
        rule_id: rule.rule_id,
        severity: rule.severity || "warning",
        result,
        evidence,
        judged_by: existing?.judged_by || "",
        checked_at: new Date().toISOString(),
      };
      planChecks.push(fields);
      checkWrites.push({ existing, fields });
    }
    const complianceScore = computeComplianceScore(planChecks);
    if (Number(row.compliance_score) !== complianceScore) {
      await upsert(
        client,
        declared("plans"),
        row,
        { ...basePlanFields(row), compliance_score: complianceScore },
        `Recompute compliance score for ${plan.plan_id}: ${complianceScore}`,
        apply,
      );
    }
  }

  for (const write of checkWrites) {
    await upsert(
      client,
      declared("checks"),
      write.existing,
      write.fields,
      `Check ${write.fields.check_id}: ${write.fields.result}`,
      apply,
    );
  }

  console.log(
    `${apply ? "Checked" : "Dry run for"} ${plans.length} plan(s) against ${complianceRules.length} rule(s): ${failCount} fail, ${warnCount} warn, ${pendingCount} awaiting agent review.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
