#!/usr/bin/env node
// Write path for lesson plans. Takes a JSON payload file containing one plan
// or { "plans": [...], "check_results": [...] }, validates the structure
// against the configured template sections, and merges it into
// app/.data/lesson_snapshot.json. Refuses to write while agent.lock exists.
//
// Plans can be agent-drafted (from curriculum materials + the school
// template) or parsed from a teacher's document by the agent — set "source"
// to "agent_draft" or "teacher_import". check_results carry agent judgements
// for rules typed "agent_review" (they are preserved by run_checks.mjs).
//
// Reaches lesson state only through the data-provider (local default /
// Busabase); still reads the raw payload file directly from disk.
//
// Usage: node scripts/ingest_plan.ts payload.json
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";
import type { PlanSections } from "../lib/types.ts";

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("Usage: node scripts/ingest_plan.ts <payload.json>");
  process.exit(1);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const provider = await createProvider();

const lock = await provider.readLock();
if (lock) {
  console.error(`Refusing to ingest: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const payloadRaw = await readJson(payloadPath);
if (!payloadRaw) {
  console.error(`Cannot read payload: ${payloadPath}`);
  process.exit(1);
}
const payload =
  Array.isArray(payloadRaw.plans) || Array.isArray(payloadRaw.check_results) ? payloadRaw : { plans: [payloadRaw] };
const incomingPlans = payload.plans || [];
const incomingCheckResults = payload.check_results || [];

const config = (await provider.readConfig()).config;
const templateSections = Array.isArray(config.template_sections) ? config.template_sections : [];
const classLength = config.school?.class_length_minutes ?? 45;
const now = new Date().toISOString();

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

function validatePlan(input, index) {
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

function normalizeSections(sections: Record<string, unknown> = {}): PlanSections {
  const normalized: PlanSections = {};
  for (const key of ARRAY_SECTIONS)
    normalized[key] = Array.isArray(sections[key]) ? (sections[key] as unknown[]).map(String) : [];
  for (const key of STRING_SECTIONS) normalized[key] = typeof sections[key] === "string" ? sections[key] : "";
  normalized.stages = (Array.isArray(sections.stages) ? (sections.stages as Record<string, unknown>[]) : []).map(
    (stage) => ({
      name: String(stage.name || ""),
      minutes: Number(stage.minutes || 0),
      activities: String(stage.activities || ""),
    }),
  );
  return normalized;
}

const allErrors = incomingPlans.flatMap((input, index) => validatePlan(input, index));
for (const result of incomingCheckResults) {
  if (!result?.plan_id || !result?.rule_id || !["pass", "warn", "fail"].includes(result?.result)) {
    allErrors.push("check_results entries need plan_id, rule_id, and result pass|warn|fail");
    break;
  }
}
if (allErrors.length) {
  console.error("Payload validation failed:");
  for (const error of allErrors) console.error(`- ${error}`);
  process.exit(1);
}

const emptySnapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-lesson",
  school: {
    name: config.school?.name || "",
    kind: config.school?.kind || "",
    class_length_minutes: classLength,
    term: config.school?.term || "",
  },
  metrics: {
    teacher_count: 0,
    plan_count: 0,
    plans_approved: 0,
    plans_in_revision: 0,
    plans_needs_review: 0,
    checks_failed: 0,
    compliance_pass_rate: 0,
  },
  teachers: [],
  plans: [],
  rules: [],
  checks: [],
  review_items: [],
  activity_log: [],
  warnings: [],
};
// The provider returns an empty-with-warning sentinel when no snapshot file
// exists; start from this script's own empty snapshot in that case so the
// written file stays identical to the pre-provider behaviour.
const existingSnapshot = await provider.readSnapshot();
const hasSnapshot =
  (existingSnapshot.plans || []).length > 0 ||
  !(existingSnapshot.warnings || []).some((warning) => warning.id === "no-snapshot");
const snapshot: Record<string, any> = hasSnapshot
  ? (existingSnapshot as unknown as Record<string, any>)
  : emptySnapshot;
snapshot.teachers = snapshot.teachers || [];
snapshot.plans = snapshot.plans || [];
snapshot.checks = snapshot.checks || [];
snapshot.review_items = snapshot.review_items || [];
snapshot.activity_log = snapshot.activity_log || [];

function ensureTeacher(input) {
  if (input.teacher_id) {
    const existing = snapshot.teachers.find((teacher) => teacher.teacher_id === input.teacher_id);
    if (existing) return existing.teacher_id;
  }
  const name = String(input.teacher || "").trim();
  if (name) {
    const byName = snapshot.teachers.find((teacher) => teacher.name === name);
    if (byName) {
      if (input.grade && !byName.grades.includes(input.grade)) byName.grades.push(input.grade);
      return byName.teacher_id;
    }
  }
  const teacherId = input.teacher_id || `t-${slugify(name || "unknown")}`;
  snapshot.teachers.push({
    teacher_id: teacherId,
    name: name || teacherId,
    subject: input.subject || "",
    grades: input.grade ? [input.grade] : [],
  });
  return teacherId;
}

let nextRef = Math.max(0, ...snapshot.plans.map((plan) => Number(plan.ref) || 0)) + 1;
let nextReviewRef = Math.max(0, ...snapshot.review_items.map((item) => Number(item.ref) || 0)) + 1;
const merged = [];

for (const input of incomingPlans) {
  const teacherId = ensureTeacher(input);
  const planId = input.plan_id || `plan-${slugify(`${input.subject}-${input.title}`)}`;
  const sections = normalizeSections(input.sections);
  const durationMinutes = (sections.stages || []).reduce((sum, stage) => sum + Number(stage.minutes || 0), 0);
  const existing = snapshot.plans.find((plan) => plan.plan_id === planId);
  if (existing) {
    Object.assign(existing, {
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      unit: input.unit ?? existing.unit ?? "",
      teacher_id: teacherId,
      source: input.source || existing.source,
      status: input.status || "needs_review",
      class_length_minutes: input.class_length_minutes || existing.class_length_minutes || classLength,
      duration_minutes: durationMinutes,
      sections,
      notes: input.notes ?? existing.notes ?? "",
      updated_at: now,
    });
    merged.push({ plan: existing, created: false });
  } else {
    const plan = {
      plan_id: planId,
      ref: nextRef++,
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      unit: input.unit || "",
      teacher_id: teacherId,
      source: input.source || "agent_draft",
      status: input.status || "needs_review",
      compliance_score: 0,
      class_length_minutes: input.class_length_minutes || classLength,
      duration_minutes: durationMinutes,
      sections,
      notes: input.notes || "",
      created_at: now,
      updated_at: now,
    };
    snapshot.plans.push(plan);
    merged.push({ plan, created: true });
  }
  const plan = merged[merged.length - 1].plan;
  let reviewItem = snapshot.review_items.find((item) => item.plan_id === plan.plan_id);
  if (!reviewItem) {
    reviewItem = {
      review_id: `rv-${slugify(plan.plan_id.replace(/^plan-/, ""))}`,
      ref: nextReviewRef++,
      plan_id: plan.plan_id,
      status: plan.status,
      compliance_summary: "Checks pending — run scripts/run_checks.mjs.",
      suggestions: [],
      feedback_draft: "",
      created_at: now,
    };
    snapshot.review_items.push(reviewItem);
  } else {
    reviewItem.status = plan.status;
  }
  if (Array.isArray(input.suggestions)) reviewItem.suggestions = input.suggestions.map(String);
  if (typeof input.compliance_summary === "string") reviewItem.compliance_summary = input.compliance_summary;
  if (typeof input.feedback_draft === "string") reviewItem.feedback_draft = input.feedback_draft;
  snapshot.activity_log.unshift({
    id: `act-${Date.now()}-${plan.ref}`,
    at: now,
    actor: "agent",
    detail: `${merged[merged.length - 1].created ? "Ingested" : "Updated"} plan "${plan.title}" (${plan.source}).`,
    plan_id: plan.plan_id,
  });
}

for (const result of incomingCheckResults) {
  const plan = snapshot.plans.find((item) => item.plan_id === result.plan_id);
  if (!plan) {
    console.error(`check_results: unknown plan ${result.plan_id}; skipped.`);
    continue;
  }
  const checkId = `chk-${plan.plan_id.replace(/^plan-/, "")}-${result.rule_id}`;
  const existing = snapshot.checks.find((check) => check.check_id === checkId);
  const entry = {
    check_id: checkId,
    plan_id: plan.plan_id,
    rule_id: result.rule_id,
    severity: existing?.severity || result.severity || "warning",
    result: result.result,
    evidence: String(result.evidence || ""),
    judged_by: "agent",
    checked_at: now,
  };
  if (existing) Object.assign(existing, entry);
  else snapshot.checks.push(entry);
}

snapshot.activity_log = snapshot.activity_log.slice(0, 50);
snapshot.metrics = {
  ...snapshot.metrics,
  teacher_count: snapshot.teachers.length,
  plan_count: snapshot.plans.length,
  plans_approved: snapshot.plans.filter((plan) => ["approved", "done"].includes(plan.status)).length,
  plans_in_revision: snapshot.plans.filter((plan) => plan.status === "changes_requested").length,
  plans_needs_review: snapshot.plans.filter((plan) => plan.status === "needs_review").length,
};
snapshot.generated_at = now;

await provider.writeSnapshot(snapshot as unknown as Parameters<typeof provider.writeSnapshot>[0]);
for (const { plan, created } of merged) {
  console.log(`${created ? "Created" : "Updated"} ${plan.plan_id} (Plan #${plan.ref}) — ${plan.title}`);
}
if (incomingCheckResults.length) console.log(`Merged ${incomingCheckResults.length} agent check result(s).`);
console.log("Wrote lesson_snapshot.json. Run scripts/run_checks.ts to refresh compliance results.");
