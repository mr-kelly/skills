#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/homework_snapshot.json", import.meta.url).pathname;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${path}.${key} must be a number`);
}

function requireArray(obj: Record<string, unknown>, key: string, path: string): unknown[] {
  const value = obj[key];
  if (!Array.isArray(value)) fail(`${path}.${key} must be an array`);
  return value;
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: any;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
for (const key of ["schema_version", "generated_at", "source"]) requireString(snapshot, key, "root");
if (!isObject(snapshot.profile)) fail("root.profile must be an object");
for (const key of ["display_name", "grade", "language"]) requireString(snapshot.profile, key, "root.profile");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "active_questions",
  "mistakes_total",
  "due_reviews",
  "papers_generated",
  "mastery_score",
  "questions_analyzed",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}

const questions = requireArray(snapshot, "questions", "root");
const mistakes = requireArray(snapshot, "mistakes", "root");
const papers = requireArray(snapshot, "papers", "root");
const reviews = requireArray(snapshot, "review_items", "root");
requireArray(snapshot, "activity_log", "root");
requireArray(snapshot, "warnings", "root");

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const OUTCOMES = new Set(["correct", "wrong", "uncertain", "in_progress"]);
const SOURCES = new Set(["photo", "text", "paper"]);
const DIFFICULTIES = new Set(["easy", "medium", "challenge"]);
const TARGET_TYPES = new Set(["question", "mistake", "paper"]);

const questionIds = new Set<string>();
const mistakeIds = new Set<string>();
const paperIds = new Set<string>();
const reviewIds = new Set<string>();

questions.forEach((question, index) => {
  const path = `root.questions[${index}]`;
  if (!isObject(question)) fail(`${path} must be an object`);
  for (const key of [
    "question_id",
    "title",
    "subject",
    "grade",
    "topic",
    "source",
    "status",
    "difficulty",
    "prompt_text",
    "student_answer",
    "correct_answer",
    "outcome",
    "created_at",
  ]) {
    requireString(question, key, path);
  }
  requireNumber(question, "ref", path);
  requireNumber(question, "confidence", path);
  if (!STATUSES.has(String(question.status))) fail(`${path}.status is invalid: ${question.status}`);
  if (!OUTCOMES.has(String(question.outcome))) fail(`${path}.outcome is invalid: ${question.outcome}`);
  if (!SOURCES.has(String(question.source))) fail(`${path}.source is invalid: ${question.source}`);
  if (!DIFFICULTIES.has(String(question.difficulty))) fail(`${path}.difficulty is invalid: ${question.difficulty}`);
  if (questionIds.has(String(question.question_id))) fail(`${path}.question_id duplicates ${question.question_id}`);
  questionIds.add(String(question.question_id));
  if (!Array.isArray(question.tags)) fail(`${path}.tags must be an array`);
  if (!isObject(question.explanation)) fail(`${path}.explanation must be an object`);
  for (const key of ["kid_summary", "key_concept", "self_check", "next_hint"])
    requireString(question.explanation, key, `${path}.explanation`);
  if (!Array.isArray(question.explanation.steps)) fail(`${path}.explanation.steps must be an array`);
});

mistakes.forEach((mistake, index) => {
  const path = `root.mistakes[${index}]`;
  if (!isObject(mistake)) fail(`${path} must be an object`);
  for (const key of [
    "mistake_id",
    "question_id",
    "subject",
    "topic",
    "mistake_type",
    "status",
    "last_seen",
    "next_review_at",
  ]) {
    requireString(mistake, key, path);
  }
  requireNumber(mistake, "ref", path);
  requireNumber(mistake, "attempts", path);
  if (!STATUSES.has(String(mistake.status))) fail(`${path}.status is invalid: ${mistake.status}`);
  if (!questionIds.has(String(mistake.question_id)))
    fail(`${path}.question_id does not match a question: ${mistake.question_id}`);
  if (mistakeIds.has(String(mistake.mistake_id))) fail(`${path}.mistake_id duplicates ${mistake.mistake_id}`);
  mistakeIds.add(String(mistake.mistake_id));
  if (!Array.isArray(mistake.review_history)) fail(`${path}.review_history must be an array`);
  if (!isObject(mistake.analysis)) fail(`${path}.analysis must be an object`);
  for (const key of ["root_cause", "misconception", "fix_strategy", "similar_prompt", "parent_note"]) {
    requireString(mistake.analysis, key, `${path}.analysis`);
  }
});

papers.forEach((paper, index) => {
  const path = `root.papers[${index}]`;
  if (!isObject(paper)) fail(`${path} must be an object`);
  for (const key of ["paper_id", "title", "subject", "grade", "status", "generated_at"])
    requireString(paper, key, path);
  for (const key of ["ref", "question_count", "estimated_minutes"]) requireNumber(paper, key, path);
  if (!STATUSES.has(String(paper.status))) fail(`${path}.status is invalid: ${paper.status}`);
  if (paperIds.has(String(paper.paper_id))) fail(`${path}.paper_id duplicates ${paper.paper_id}`);
  paperIds.add(String(paper.paper_id));
  for (const key of ["focus_topics", "linked_mistakes", "items"]) {
    if (!Array.isArray(paper[key])) fail(`${path}.${key} must be an array`);
  }
  if (!isObject(paper.difficulty_mix)) fail(`${path}.difficulty_mix must be an object`);
  if (!isObject(paper.analysis)) fail(`${path}.analysis must be an object`);
  requireNumber(paper.analysis, "wrong_count", `${path}.analysis`);
  for (const key of ["strengths", "review_plan"]) {
    if (!Array.isArray(paper.analysis[key])) fail(`${path}.analysis.${key} must be an array`);
  }
  requireString(paper.analysis, "deep_notes", `${path}.analysis`);
});

reviews.forEach((review, index) => {
  const path = `root.review_items[${index}]`;
  if (!isObject(review)) fail(`${path} must be an object`);
  for (const key of [
    "review_id",
    "target_type",
    "target_id",
    "title",
    "status",
    "summary",
    "proposed_action",
    "reason",
    "suggested_note",
  ]) {
    requireString(review, key, path);
  }
  requireNumber(review, "ref", path);
  if (!STATUSES.has(String(review.status))) fail(`${path}.status is invalid: ${review.status}`);
  if (!TARGET_TYPES.has(String(review.target_type))) fail(`${path}.target_type is invalid: ${review.target_type}`);
  if (!Array.isArray(review.risk)) fail(`${path}.risk must be an array`);
  if (!Array.isArray(review.suggestions)) fail(`${path}.suggestions must be an array`);
  if (reviewIds.has(String(review.review_id))) fail(`${path}.review_id duplicates ${review.review_id}`);
  reviewIds.add(String(review.review_id));
  const targetId = String(review.target_id);
  const ok =
    (review.target_type === "question" && questionIds.has(targetId)) ||
    (review.target_type === "mistake" && mistakeIds.has(targetId)) ||
    (review.target_type === "paper" && paperIds.has(targetId));
  if (!ok) fail(`${path}.target_id does not match target_type: ${targetId}`);
});

console.log(`OK: ${target}`);
