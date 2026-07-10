#!/usr/bin/env node
import fs from "node:fs/promises";
import { BATCH_PATH } from "../lib/paths.ts";

const target = process.argv[2] || BATCH_PATH;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj: JsonObject, key: string, path: string, allowed: string[]): void {
  if (!allowed.includes(obj[key])) fail(`${path}.${key} must be one of ${allowed.join("|")}, got ${obj[key]}`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let batch: JsonObject;
try {
  batch = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(batch)) fail("root must be an object");
requireString(batch, "batch_id", "root");
requireString(batch, "generated_at", "root");
requireString(batch, "source", "root");
requireString(batch, "mode", "root");
if (!Array.isArray(batch.items)) fail("root.items must be an array");

if (!isObject(batch.metrics)) fail("root.metrics must be an object");
for (const key of ["needs_review", "approved", "done", "blocked"]) requireNumber(batch.metrics, key, "root.metrics");

if (!isObject(batch.distribution)) fail("root.distribution must be an object");
for (const key of ["high_confidence", "needs_review", "low_confidence", "average_score"]) {
  requireNumber(batch.distribution, key, "root.distribution");
}

const ids = new Set();
const CATEGORIES = ["F&B", "Retail", "Fitness", "Education"];
const STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

batch.items.forEach((item: JsonObject, index: number) => {
  const path = `root.items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  requireString(item, "id", path);
  requireString(item, "business_name", path);
  requireEnum(item, "category", path, CATEGORIES);
  requireString(item, "city", path);
  requireNumber(item, "requested_principal", path);
  requireEnum(item, "status", path, STATUSES);
  if (!Array.isArray(item.monthly_revenue) || item.monthly_revenue.length < 6) {
    fail(`${path}.monthly_revenue must be an array of >= 6 months`);
  }
  if (!Array.isArray(item.red_flags)) fail(`${path}.red_flags must be an array`);
  if (ids.has(item.id)) fail(`${path}.id duplicates ${item.id}`);
  ids.add(item.id);

  if (!isObject(item.score)) fail(`${path}.score must be an object`);
  requireNumber(item.score, "composite_score", `${path}.score`);
  if (item.score.composite_score < 0 || item.score.composite_score > 100) {
    fail(`${path}.score.composite_score must be within 0-100`);
  }
  if (!Array.isArray(item.score.factors) || item.score.factors.length !== 5) {
    fail(`${path}.score.factors must be an array of exactly 5 sub-factors`);
  }
  const weightSum = item.score.factors.reduce((sum: number, f: JsonObject) => sum + Number(f.weight || 0), 0);
  if (Math.abs(weightSum - 1) > 0.01) fail(`${path}.score.factors weights sum to ${weightSum}, expected 1.0`);
  const contributionSum = item.score.factors.reduce(
    (sum: number, f: JsonObject) => sum + Number(f.contribution || 0),
    0,
  );
  if (Math.abs(contributionSum - item.score.composite_score) > 0.5) {
    fail(
      `${path}.score.composite_score (${item.score.composite_score}) != sum of factor contributions (${contributionSum.toFixed(1)})`,
    );
  }
  if (!isObject(item.score.suggested_share_rate)) fail(`${path}.score.suggested_share_rate must be an object`);
  requireNumber(item.score.suggested_share_rate, "min_pct", `${path}.score.suggested_share_rate`);
  requireNumber(item.score.suggested_share_rate, "max_pct", `${path}.score.suggested_share_rate`);
});

console.log(`OK: ${target} (${batch.items.length} candidates)`);
