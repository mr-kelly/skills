#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "insure_snapshot.json");

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, at: string): void {
  if (typeof obj[key] !== "string") fail(`${at}.${key} must be a string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, at: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${at}.${key} must be a number`);
}

function requireArray(obj: Record<string, unknown>, key: string, at: string): unknown[] {
  if (!Array.isArray(obj[key])) fail(`${at}.${key} must be an array`);
  return obj[key] as unknown[];
}

async function readJson(file: string) {
  let raw = "";
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    fail(`cannot read ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${(error as Error).message}`);
  }
}

function validateGovernance(item: Record<string, unknown>, at: string): void {
  if (!isObject(item.governance)) fail(`${at}.governance must be an object`);
  requireNumber(item.governance, "completeness_pct", `${at}.governance`);
  requireArray(item.governance, "missing_fields", `${at}.governance`);
  requireString(item.governance, "status", `${at}.governance`);
}

function validateMetadataFields(fields: unknown[], at: string): void {
  fields.forEach((field, index) => {
    if (!isObject(field)) fail(`${at}[${index}] must be an object`);
    requireString(field, "key", `${at}[${index}]`);
  });
}

const snapshot = await readJson(snapshotPath);
if (!isObject(snapshot)) fail("root must be an object");

for (const key of ["schema_version", "generated_at", "source"]) requireString(snapshot, key, "root");
if (!isObject(snapshot.drive)) fail("root.drive must be an object");
for (const key of ["node_id", "name", "slug"]) requireString(snapshot.drive, key, "root.drive");
if (!isObject(snapshot.drive.metadata)) fail("root.drive.metadata must be an object");
validateMetadataFields(requireArray(snapshot.drive, "metadata_fields", "root.drive"), "root.drive.metadata_fields");

if (!isObject(snapshot.bases)) fail("root.bases must be an object");
for (const baseName of ["qa", "news", "feedback"]) {
  const base = snapshot.bases[baseName];
  if (!isObject(base)) fail(`root.bases.${baseName} must be an object`);
  for (const key of ["base_id", "name", "slug"]) requireString(base, key, `root.bases.${baseName}`);
  validateMetadataFields(requireArray(base, "fields", `root.bases.${baseName}`), `root.bases.${baseName}.fields`);
}

if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of ["file_count", "metadata_field_count", "qa_count", "news_count", "feedback_count", "total_records"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if ("data_quality_score" in snapshot.metrics) requireNumber(snapshot.metrics, "data_quality_score", "root.metrics");
if ("needs_governance" in snapshot.metrics) requireNumber(snapshot.metrics, "needs_governance", "root.metrics");

const files = requireArray(snapshot, "files", "root");
files.forEach((file, index) => {
  if (!isObject(file)) fail(`root.files[${index}] must be an object`);
  for (const key of ["id", "name", "path", "mime_type", "updated_at"]) requireString(file, key, `root.files[${index}]`);
  requireNumber(file, "size", `root.files[${index}]`);
  if (!isObject(file.metadata)) fail(`root.files[${index}].metadata must be an object`);
  validateGovernance(file, `root.files[${index}]`);
});

const qaPairs = requireArray(snapshot, "qa_pairs", "root");
qaPairs.forEach((item, index) => {
  if (!isObject(item)) fail(`root.qa_pairs[${index}] must be an object`);
  for (const key of ["id", "question", "answer", "category", "source", "updated_at", "status"]) {
    requireString(item, key, `root.qa_pairs[${index}]`);
  }
  requireArray(item, "tags", `root.qa_pairs[${index}]`);
  if (!isObject(item.fields)) fail(`root.qa_pairs[${index}].fields must be an object`);
  validateGovernance(item, `root.qa_pairs[${index}]`);
});

const news = requireArray(snapshot, "news_items", "root");
news.forEach((item, index) => {
  if (!isObject(item)) fail(`root.news_items[${index}] must be an object`);
  for (const key of ["id", "title", "summary", "url", "source", "published_at", "category", "status"]) {
    requireString(item, key, `root.news_items[${index}]`);
  }
  requireArray(item, "tags", `root.news_items[${index}]`);
  if (!isObject(item.fields)) fail(`root.news_items[${index}].fields must be an object`);
  validateGovernance(item, `root.news_items[${index}]`);
});

const feedback = requireArray(snapshot, "feedback_items", "root");
feedback.forEach((item, index) => {
  if (!isObject(item)) fail(`root.feedback_items[${index}] must be an object`);
  for (const key of [
    "id",
    "title",
    "content",
    "source",
    "user_name",
    "contact",
    "rating",
    "category",
    "created_at",
    "status",
  ]) {
    requireString(item, key, `root.feedback_items[${index}]`);
  }
  requireArray(item, "tags", `root.feedback_items[${index}]`);
  if (!isObject(item.fields)) fail(`root.feedback_items[${index}].fields must be an object`);
  validateGovernance(item, `root.feedback_items[${index}]`);
});

requireArray(snapshot, "warnings", "root");
console.log(`OK: ${snapshotPath}`);
