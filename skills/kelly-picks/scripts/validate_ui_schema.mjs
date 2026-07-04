#!/usr/bin/env node
// Validates a picks snapshot against references/picks-schema.md.
// Usage: node scripts/validate_ui_schema.mjs [path/to/picks_snapshot.json]
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/picks_snapshot.json", import.meta.url).pathname;

const SOURCE_KINDS = ["amazon_bsr", "tiktok", "temu", "aliexpress", "trends", "competitor"];
const STAGES = ["new", "reviewing", "develop", "watch", "dropped"];
const PROPOSAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
const VERDICTS = ["develop", "watch", "drop"];
const GRADES = ["A", "B", "C", "D"];
const METHODS = ["browser_agent", "manual"];

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

function requireEnum(obj, key, values, path) {
  if (!values.includes(obj[key]))
    fail(`${path}.${key} must be one of ${values.join("|")} (got ${JSON.stringify(obj[key])})`);
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
requireString(snapshot, "base_currency", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "source_count",
  "trend_item_count",
  "candidate_count",
  "candidates_new_7d",
  "candidates_to_review",
  "in_development",
  "watching",
  "dropped",
  "proposals_needs_review",
  "avg_margin_approved_pct",
  "below_margin_floor",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["sources", "trend_items", "candidates", "proposals", "sync_log"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const sourceIds = new Set();
snapshot.sources.forEach((source, index) => {
  const path = `root.sources[${index}]`;
  if (!isObject(source)) fail(`${path} must be an object`);
  for (const key of ["source_id", "kind", "name", "method"]) requireString(source, key, path);
  requireEnum(source, "kind", SOURCE_KINDS, path);
  requireEnum(source, "method", METHODS, path);
  if (sourceIds.has(source.source_id)) fail(`${path}.source_id duplicates ${source.source_id}`);
  sourceIds.add(source.source_id);
});

const trendIds = new Set();
snapshot.trend_items.forEach((item, index) => {
  const path = `root.trend_items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["trend_id", "source", "title", "observed_at"]) requireString(item, key, path);
  requireEnum(item, "source", SOURCE_KINDS, path);
  for (const key of ["metric_value", "delta_pct"]) requireNumber(item, key, path);
  if (!Array.isArray(item.momentum)) fail(`${path}.momentum must be an array`);
  if (trendIds.has(item.trend_id)) fail(`${path}.trend_id duplicates ${item.trend_id}`);
  trendIds.add(item.trend_id);
});

const candidateIds = new Set();
snapshot.candidates.forEach((item, index) => {
  const path = `root.candidates[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["candidate_id", "name", "category", "source", "stage", "currency", "first_seen"])
    requireString(item, key, path);
  requireEnum(item, "source", SOURCE_KINDS, path);
  requireEnum(item, "stage", STAGES, path);
  requireEnum(item, "competition_grade", GRADES, path);
  requireNumber(item, "est_price", path);
  if (candidateIds.has(item.candidate_id)) fail(`${path}.candidate_id duplicates ${item.candidate_id}`);
  candidateIds.add(item.candidate_id);
  if (item.source_ref && !trendIds.has(item.source_ref))
    fail(`${path}.source_ref does not match a trend item: ${item.source_ref}`);
  if (!isObject(item.margin_card)) fail(`${path}.margin_card must be an object`);
  for (const key of [
    "price",
    "cogs",
    "freight",
    "platform_fee_pct",
    "ad_cost",
    "margin",
    "margin_pct",
    "breakeven_acos_pct",
  ]) {
    requireNumber(item.margin_card, key, `${path}.margin_card`);
  }
  if (typeof item.margin_card.below_floor !== "boolean") fail(`${path}.margin_card.below_floor must be a boolean`);
  if (!isObject(item.competition)) fail(`${path}.competition must be an object`);
  if (!Array.isArray(item.competition.top_review_counts))
    fail(`${path}.competition.top_review_counts must be an array`);
  if (item.competition.top_review_counts.some((value) => typeof value !== "number"))
    fail(`${path}.competition.top_review_counts must contain numbers`);
  if (!Array.isArray(item.evidence)) fail(`${path}.evidence must be an array`);
  item.evidence.forEach((entry, entryIndex) => {
    if (!isObject(entry)) fail(`${path}.evidence[${entryIndex}] must be an object`);
    requireString(entry, "title", `${path}.evidence[${entryIndex}]`);
    requireString(entry, "url", `${path}.evidence[${entryIndex}]`);
  });
});

snapshot.trend_items.forEach((item, index) => {
  if (item.candidate_id && !candidateIds.has(item.candidate_id)) {
    fail(`root.trend_items[${index}].candidate_id does not match a candidate: ${item.candidate_id}`);
  }
});

const proposalIds = new Set();
snapshot.proposals.forEach((item, index) => {
  const path = `root.proposals[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["proposal_id", "candidate_id", "title", "verdict", "status", "reason", "brief", "proposed_at"])
    requireString(item, key, path);
  requireEnum(item, "verdict", VERDICTS, path);
  requireEnum(item, "status", PROPOSAL_STATUSES, path);
  if (proposalIds.has(item.proposal_id)) fail(`${path}.proposal_id duplicates ${item.proposal_id}`);
  proposalIds.add(item.proposal_id);
  if (!candidateIds.has(item.candidate_id))
    fail(`${path}.candidate_id does not match a candidate: ${item.candidate_id}`);
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["at", "actor", "action", "detail"]) requireString(entry, key, path);
});

console.log(`OK: ${target}`);
