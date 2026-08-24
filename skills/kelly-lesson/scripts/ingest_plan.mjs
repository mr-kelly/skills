#!/usr/bin/env node
// Trusted hand-off step. Kelly Lesson's AirApp never ingests a lesson plan
// itself — the browser cannot read an arbitrary local file path. This script
// parses a JSON payload file (one plan, or { "plans": [...], "check_results":
// [...] }), validates it against the school template sections stored on the
// Settings row, normalizes teachers/plans/checks, and upserts them into
// Busabase by natural key (teacher_id/name, plan_id) so re-ingests are
// idempotent.
//
// slugify/validatePlan/normalizeSections/ARRAY_SECTIONS/STRING_SECTIONS/
// SOURCES/STATUSES are ported verbatim from the retired scripts/ingest_plan.ts;
// only the write target changed, from a persisted content/kelly-lesson-app/.data/lesson_snapshot.json
// to Busabase's teachers/plans/checks Bases.
//
// Usage: node scripts/ingest_plan.mjs <payload.json> [--apply]
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-lesson-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/ingest_plan.mjs <payload.json> [--apply]

Parses a JSON payload file (one plan object, or { "plans": [...], "check_results":
[...] }), validates it against the school template sections on the Settings
row, and upserts teachers/plans/checks into Busabase. Without --apply this is
a dry run that only prints what would be written.`);
}

// ---- Ported verbatim from the retired scripts/ingest_plan.ts ----

const ARRAY_SECTIONS = ["objectives", "key_points", "difficulties", "materials", "curriculum_refs"];
const STRING_SECTIONS = ["board_plan", "homework", "reflection", "safety_notes"];
const SOURCES = new Set(["agent_draft", "teacher_import"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "plan"
  );
}

function validatePlan(input, index, templateSections) {
  const errors = [];
  const where = `plans[${index}]`;
  for (const key of ["title", "subject", "grade"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  if (!input.teacher_id && !(typeof input.teacher === "string" && input.teacher.trim())) {
    errors.push(`${where} needs teacher_id or teacher (name)`);
  }
  if (input.source && !SOURCES.has(input.source)) errors.push(`${where}.source must be agent_draft or teacher_import`);
  if (input.status && !STATUSES.has(input.status)) errors.push(`${where}.status is invalid: ${input.status}`);
  const sections = input.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    errors.push(`${where}.sections must be an object`);
    return errors;
  }
  for (const key of ARRAY_SECTIONS) {
    if (sections[key] !== undefined && !Array.isArray(sections[key]))
      errors.push(`${where}.sections.${key} must be an array`);
  }
  for (const key of STRING_SECTIONS) {
    if (sections[key] !== undefined && typeof sections[key] !== "string")
      errors.push(`${where}.sections.${key} must be a string`);
  }
  if (sections.stages !== undefined) {
    if (!Array.isArray(sections.stages)) {
      errors.push(`${where}.sections.stages must be an array`);
    } else {
      sections.stages.forEach((stage, stageIndex) => {
        if (!stage || typeof stage !== "object")
          errors.push(`${where}.sections.stages[${stageIndex}] must be an object`);
        else if (typeof stage.name !== "string" || !stage.name.trim())
          errors.push(`${where}.sections.stages[${stageIndex}].name must be a non-empty string`);
      });
    }
  }
  const knownKeys = new Set([...ARRAY_SECTIONS, ...STRING_SECTIONS, "stages"]);
  const templateKeys = new Set(templateSections.map((section) => section.key));
  for (const key of Object.keys(sections)) {
    if (!knownKeys.has(key) && !templateKeys.has(key))
      errors.push(`${where}.sections.${key} is not a known template section`);
  }
  return errors;
}

function normalizeSections(sections = {}) {
  const normalized = {};
  for (const key of ARRAY_SECTIONS) normalized[key] = Array.isArray(sections[key]) ? sections[key].map(String) : [];
  for (const key of STRING_SECTIONS) normalized[key] = typeof sections[key] === "string" ? sections[key] : "";
  normalized.stages = (Array.isArray(sections.stages) ? sections.stages : []).map((stage) => ({
    name: String(stage.name || ""),
    minutes: Number(stage.minutes || 0),
    activities: String(stage.activities || ""),
  }));
  return normalized;
}

// ---- Busabase plumbing ----

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

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-lesson-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-lesson-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadPath = argv.find((arg) => !arg.startsWith("--"));
  if (!payloadPath) return help();

  const payloadRaw = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const payload =
    Array.isArray(payloadRaw.plans) || Array.isArray(payloadRaw.check_results) ? payloadRaw : { plans: [payloadRaw] };
  const incomingPlans = payload.plans || [];
  const incomingCheckResults = payload.check_results || [];

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

  const [existingTeachers, existingPlans, existingChecks, settingsRows] = await Promise.all([
    readAll(client, declared("teachers")),
    readAll(client, declared("plans")),
    readAll(client, declared("checks")),
    readAll(client, declared("settings")),
  ]);
  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const templateSections = (() => {
    try {
      return settings.template_sections ? JSON.parse(settings.template_sections) : [];
    } catch {
      return [];
    }
  })();
  const classLength = Number(settings.class_length_minutes) || 45;

  const allErrors = incomingPlans.flatMap((input, index) => validatePlan(input, index, templateSections));
  for (const result of incomingCheckResults) {
    if (!result?.plan_id || !result?.rule_id || !["pass", "warn", "fail"].includes(result?.result)) {
      allErrors.push("check_results entries need plan_id, rule_id, and result pass|warn|fail");
      break;
    }
  }
  if (allErrors.length) {
    for (const error of allErrors) console.error(`- ${error}`);
    throw new Error("Payload validation failed");
  }

  const teachersByName = new Map(existingTeachers.map((row) => [row.name, row]));
  const teachersById = new Map(existingTeachers.map((row) => [row.teacher_id, row]));
  const teacherWrites = [];

  function ensureTeacher(input) {
    if (input.teacher_id && teachersById.has(input.teacher_id)) return input.teacher_id;
    const name = String(input.teacher || "").trim();
    if (name && teachersByName.has(name)) {
      const existing = teachersByName.get(name);
      const grades = (() => {
        try {
          return existing.grades ? JSON.parse(existing.grades) : [];
        } catch {
          return [];
        }
      })();
      if (input.grade && !grades.includes(input.grade)) {
        grades.push(input.grade);
        teacherWrites.push({
          existing,
          fields: {
            teacher_id: existing.teacher_id,
            name: existing.name,
            subject: existing.subject,
            grades: JSON.stringify(grades),
          },
        });
      }
      return existing.teacher_id;
    }
    const teacherId = input.teacher_id || `t-${slugify(name || "unknown")}`;
    const fields = {
      teacher_id: teacherId,
      name: name || teacherId,
      subject: input.subject || "",
      grades: JSON.stringify(input.grade ? [input.grade] : []),
    };
    teacherWrites.push({ existing: null, fields });
    teachersById.set(teacherId, fields);
    teachersByName.set(fields.name, fields);
    return teacherId;
  }

  const plansById = new Map(existingPlans.map((row) => [row.plan_id, row]));
  const now = new Date().toISOString();
  let nextRef = Math.max(0, ...existingPlans.map((row) => Number(row.ref) || 0)) + 1;
  const planWrites = [];

  for (const input of incomingPlans) {
    const teacherId = ensureTeacher(input);
    const planId = input.plan_id || `plan-${slugify(`${input.subject}-${input.title}`)}`;
    const sections = normalizeSections(input.sections);
    const durationMinutes = sections.stages.reduce((sum, stage) => sum + Number(stage.minutes || 0), 0);
    const existing = plansById.get(planId);
    const fields = {
      plan_id: planId,
      ref: existing ? existing.ref : nextRef++,
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      unit: input.unit ?? existing?.unit ?? "",
      teacher_id: teacherId,
      source: input.source || existing?.source || "agent_draft",
      status: input.status || "needs_review",
      compliance_score: existing?.compliance_score || 0,
      class_length_minutes: input.class_length_minutes || existing?.class_length_minutes || classLength,
      duration_minutes: durationMinutes,
      objectives: JSON.stringify(sections.objectives),
      key_points: JSON.stringify(sections.key_points),
      difficulties: JSON.stringify(sections.difficulties),
      materials: JSON.stringify(sections.materials),
      curriculum_refs: JSON.stringify(sections.curriculum_refs),
      board_plan: sections.board_plan,
      homework: sections.homework,
      reflection: sections.reflection,
      safety_notes: sections.safety_notes,
      stages: JSON.stringify(sections.stages),
      notes: input.notes ?? existing?.notes ?? "",
      compliance_summary:
        typeof input.compliance_summary === "string"
          ? input.compliance_summary
          : existing?.compliance_summary || "Checks pending — run scripts/run_checks.mjs.",
      suggestions: JSON.stringify(Array.isArray(input.suggestions) ? input.suggestions.map(String) : []),
      feedback_draft: typeof input.feedback_draft === "string" ? input.feedback_draft : existing?.feedback_draft || "",
      decision_action: existing?.decision_action || "",
      decision_note: existing?.decision_note || "",
      decided_at: existing?.decided_at || "",
      execution_status: existing?.execution_status || "",
      execution_operation: existing?.execution_operation || "",
      execution_target: existing?.execution_target || "",
      execution_detail: existing?.execution_detail || "",
      executed_at: existing?.executed_at || "",
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    planWrites.push({ existing, fields, created: !existing, title: input.title, source: fields.source });
    plansById.set(planId, fields);
  }

  const checksByKey = new Map(existingChecks.map((row) => [`${row.plan_id}:${row.rule_id}`, row]));
  const checkWrites = [];
  for (const result of incomingCheckResults) {
    if (!plansById.has(result.plan_id)) {
      console.error(`check_results: unknown plan ${result.plan_id}; skipped.`);
      continue;
    }
    const checkId = `chk-${result.plan_id.replace(/^plan-/, "")}-${result.rule_id}`;
    const existing = checksByKey.get(`${result.plan_id}:${result.rule_id}`);
    const fields = {
      check_id: checkId,
      plan_id: result.plan_id,
      rule_id: result.rule_id,
      severity: existing?.severity || result.severity || "warning",
      result: result.result,
      evidence: String(result.evidence || ""),
      judged_by: "agent",
      checked_at: now,
    };
    checkWrites.push({ existing, fields });
  }

  for (const write of teacherWrites) {
    await upsert(
      client,
      declared("teachers"),
      write.existing,
      write.fields,
      `Ensure teacher ${write.fields.teacher_id}`,
      apply,
    );
  }
  for (const write of planWrites) {
    await upsert(
      client,
      declared("plans"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} plan ${write.fields.plan_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.plan_id} (Plan #${write.fields.ref}) — ${write.title}`,
    );
  }
  for (const write of checkWrites) {
    await upsert(
      client,
      declared("checks"),
      write.existing,
      write.fields,
      `Agent check result ${write.fields.check_id}`,
      apply,
    );
  }
  if (checkWrites.length)
    console.log(`${apply ? "Merged" : "Would merge"} ${checkWrites.length} agent check result(s).`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write to Busabase.");
  } else {
    console.log("Wrote teachers/plans/checks to Busabase. Run scripts/run_checks.mjs to refresh compliance results.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
