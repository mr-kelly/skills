#!/usr/bin/env node
import fs from "node:fs/promises";
import { DATASET_PATH } from "../lib/paths.ts";

const target = process.argv[2] || DATASET_PATH;

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

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let dataset: JsonObject;
try {
  dataset = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(dataset)) fail("root must be an object");
requireString(dataset, "schema_version", "root");
requireString(dataset, "seed", "root");
if (!isObject(dataset.overall_funnel)) fail("root.overall_funnel must be an object");
if (!isObject(dataset.overall_backtest)) fail("root.overall_backtest must be an object");
if (!Array.isArray(dataset.segments) || dataset.segments.length === 0) fail("root.segments must be a non-empty array");

const FUNNEL_STAGES = ["browse", "search", "compare", "booking_attempt", "complete"];
const NEXT_ACTIONS = [
  "send_discount_offer",
  "show_urgency_banner",
  "recommend_similar_items",
  "send_reminder_email",
  "no_action_needed",
];

for (const stage of FUNNEL_STAGES) {
  requireNumber(dataset.overall_funnel.stage_counts, stage, "root.overall_funnel.stage_counts");
}

const segmentIds = new Set<string>();
dataset.segments.forEach((entry: JsonObject, index: number) => {
  const path = `root.segments[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  requireString(entry, "segment_id", path);
  requireNumber(entry, "session_count", path);
  if (segmentIds.has(entry.segment_id)) fail(`${path}.segment_id duplicates ${entry.segment_id}`);
  segmentIds.add(entry.segment_id);

  if (!isObject(entry.funnel)) fail(`${path}.funnel must be an object`);
  for (const stage of FUNNEL_STAGES) requireNumber(entry.funnel.stage_counts, stage, `${path}.funnel.stage_counts`);

  if (!isObject(entry.prediction_summary)) fail(`${path}.prediction_summary must be an object`);
  if (!NEXT_ACTIONS.includes(entry.prediction_summary.dominant_action)) {
    fail(`${path}.prediction_summary.dominant_action must be one of ${NEXT_ACTIONS.join("|")}`);
  }

  if (!isObject(entry.backtest)) fail(`${path}.backtest must be an object`);
  for (const key of ["total", "correct", "accuracy", "macro_precision", "macro_recall", "macro_f1"]) {
    requireNumber(entry.backtest, key, `${path}.backtest`);
  }
  if (entry.backtest.total !== entry.session_count) {
    fail(`${path}.backtest.total (${entry.backtest.total}) != session_count (${entry.session_count})`);
  }

  if (!Array.isArray(entry.sessions) || entry.sessions.length !== entry.session_count) {
    fail(`${path}.sessions length must equal session_count`);
  }
});

// Consistency: overall funnel browse count should equal the sum of segment browse counts.
const sumBrowse = dataset.segments.reduce((sum: number, s: JsonObject) => sum + s.funnel.stage_counts.browse, 0);
if (sumBrowse !== dataset.overall_funnel.stage_counts.browse) {
  fail(
    `overall_funnel.stage_counts.browse (${dataset.overall_funnel.stage_counts.browse}) != sum of segments (${sumBrowse})`,
  );
}

console.log(`OK: ${target} (${dataset.segments.length} segments, ${dataset.overall_backtest.total} backtest sessions)`);
