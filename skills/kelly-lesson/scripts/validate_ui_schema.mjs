#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/lesson_snapshot.json", import.meta.url).pathname;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.school)) fail("root.school must be an object");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "teacher_count",
  "plan_count",
  "plans_approved",
  "plans_in_revision",
  "plans_needs_review",
  "checks_failed",
  "compliance_pass_rate",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["teachers", "plans", "rules", "checks", "review_items", "activity_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const PLAN_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const CHECK_RESULTS = new Set(["pass", "warn", "fail", "agent_review"]);
const SOURCES = new Set(["agent_draft", "teacher_import"]);

const teacherIds = new Set();
snapshot.teachers.forEach((teacher, index) => {
  const path = `root.teachers[${index}]`;
  if (!isObject(teacher)) fail(`${path} must be an object`);
  for (const key of ["teacher_id", "name", "subject"]) requireString(teacher, key, path);
  if (!Array.isArray(teacher.grades)) fail(`${path}.grades must be an array`);
  if (teacherIds.has(teacher.teacher_id)) fail(`${path}.teacher_id duplicates ${teacher.teacher_id}`);
  teacherIds.add(teacher.teacher_id);
});

const ruleIds = new Set();
snapshot.rules.forEach((rule, index) => {
  const path = `root.rules[${index}]`;
  if (!isObject(rule)) fail(`${path} must be an object`);
  for (const key of ["rule_id", "name", "severity", "type"]) requireString(rule, key, path);
  if (ruleIds.has(rule.rule_id)) fail(`${path}.rule_id duplicates ${rule.rule_id}`);
  ruleIds.add(rule.rule_id);
});

const planIds = new Set();
const planRefs = new Set();
snapshot.plans.forEach((plan, index) => {
  const path = `root.plans[${index}]`;
  if (!isObject(plan)) fail(`${path} must be an object`);
  for (const key of ["plan_id", "title", "subject", "grade", "teacher_id", "source", "status"])
    requireString(plan, key, path);
  for (const key of ["ref", "compliance_score", "class_length_minutes", "duration_minutes"])
    requireNumber(plan, key, path);
  if (!PLAN_STATUSES.has(plan.status)) fail(`${path}.status is invalid: ${plan.status}`);
  if (!SOURCES.has(plan.source)) fail(`${path}.source is invalid: ${plan.source}`);
  if (planIds.has(plan.plan_id)) fail(`${path}.plan_id duplicates ${plan.plan_id}`);
  planIds.add(plan.plan_id);
  if (planRefs.has(plan.ref)) fail(`${path}.ref duplicates ${plan.ref}`);
  planRefs.add(plan.ref);
  if (!teacherIds.has(plan.teacher_id)) fail(`${path}.teacher_id does not match a teacher: ${plan.teacher_id}`);
  if (!isObject(plan.sections)) fail(`${path}.sections must be an object`);
  for (const key of ["objectives", "key_points", "difficulties", "materials", "curriculum_refs"]) {
    if (!Array.isArray(plan.sections[key])) fail(`${path}.sections.${key} must be an array`);
  }
  if (!Array.isArray(plan.sections.stages)) fail(`${path}.sections.stages must be an array`);
  plan.sections.stages.forEach((stage, stageIndex) => {
    const stagePath = `${path}.sections.stages[${stageIndex}]`;
    if (!isObject(stage)) fail(`${stagePath} must be an object`);
    requireString(stage, "name", stagePath);
    requireNumber(stage, "minutes", stagePath);
  });
  for (const key of ["board_plan", "homework", "reflection", "safety_notes"]) {
    if (typeof plan.sections[key] !== "string") fail(`${path}.sections.${key} must be a string`);
  }
});

const checkIds = new Set();
snapshot.checks.forEach((check, index) => {
  const path = `root.checks[${index}]`;
  if (!isObject(check)) fail(`${path} must be an object`);
  for (const key of ["check_id", "plan_id", "rule_id", "severity", "result"]) requireString(check, key, path);
  if (typeof check.evidence !== "string") fail(`${path}.evidence must be a string`);
  if (!CHECK_RESULTS.has(check.result)) fail(`${path}.result is invalid: ${check.result}`);
  if (checkIds.has(check.check_id)) fail(`${path}.check_id duplicates ${check.check_id}`);
  checkIds.add(check.check_id);
  if (!planIds.has(check.plan_id)) fail(`${path}.plan_id does not match a plan: ${check.plan_id}`);
  if (!ruleIds.has(check.rule_id)) fail(`${path}.rule_id does not match a rule: ${check.rule_id}`);
});

const reviewIds = new Set();
snapshot.review_items.forEach((item, index) => {
  const path = `root.review_items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["review_id", "plan_id", "status"]) requireString(item, key, path);
  requireNumber(item, "ref", path);
  if (!PLAN_STATUSES.has(item.status)) fail(`${path}.status is invalid: ${item.status}`);
  if (!Array.isArray(item.suggestions)) fail(`${path}.suggestions must be an array`);
  if (typeof item.feedback_draft !== "string") fail(`${path}.feedback_draft must be a string`);
  if (reviewIds.has(item.review_id)) fail(`${path}.review_id duplicates ${item.review_id}`);
  reviewIds.add(item.review_id);
  if (!planIds.has(item.plan_id)) fail(`${path}.plan_id does not match a plan: ${item.plan_id}`);
});

snapshot.activity_log.forEach((entry, index) => {
  const path = `root.activity_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["id", "at", "actor", "detail"]) requireString(entry, key, path);
});

console.log(`OK: ${target}`);
