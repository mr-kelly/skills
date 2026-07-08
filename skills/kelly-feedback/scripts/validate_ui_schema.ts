#!/usr/bin/env node
// Validates a feedback snapshot against references/feedback-schema.md.
// Usage: node scripts/validate_ui_schema.ts [path/to/feedback_snapshot.json]
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/feedback_snapshot.json", import.meta.url).pathname;

const CHANNELS = ["email", "discord", "slack", "x", "appstore", "survey", "interview"];
const SENTIMENTS = ["positive", "neutral", "negative"];
const TRIAGE = ["new", "clustered", "ignored", "insight"];
const REQUEST_STATUSES = ["candidate", "roadmap", "declined", "needs_info"];
const PROPOSAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
const PROPOSAL_TYPES = ["promote_request", "decline_request", "merge_requests", "publish_changelog"];
const TRENDS = ["up", "flat", "down"];
const LANES = ["now", "next", "later"];

type JsonObject = Record<string, any>;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj: JsonObject, key: string, values: string[], path: string): void {
  if (!values.includes(obj[key]))
    fail(`${path}.${key} must be one of ${values.join("|")} (got ${JSON.stringify(obj[key])})`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: JsonObject;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
for (const key of ["products", "sources", "feedback", "requests", "proposals", "sync_log"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}
if (!isObject(snapshot.roadmap)) fail("root.roadmap must be an object");
for (const lane of LANES) {
  if (!Array.isArray(snapshot.roadmap[lane])) fail(`root.roadmap.${lane} must be an array`);
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "feedback_count",
  "new_feedback",
  "request_count",
  "proposals_needs_review",
  "requests_needs_info",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!isObject(snapshot.metrics.week_inflow)) fail("root.metrics.week_inflow must be an object");
if (!isObject(snapshot.metrics.sentiment)) fail("root.metrics.sentiment must be an object");

const productIds = new Set();
snapshot.products.forEach((product, index) => {
  const path = `root.products[${index}]`;
  if (!isObject(product)) fail(`${path} must be an object`);
  for (const key of ["product_id", "display_name"]) requireString(product, key, path);
  if (productIds.has(product.product_id)) fail(`${path}.product_id duplicates ${product.product_id}`);
  productIds.add(product.product_id);
});

const sourceIds = new Set();
snapshot.sources.forEach((source, index) => {
  const path = `root.sources[${index}]`;
  if (!isObject(source)) fail(`${path} must be an object`);
  for (const key of ["source_id", "name"]) requireString(source, key, path);
  requireEnum(source, "channel", CHANNELS, path);
  if (sourceIds.has(source.source_id)) fail(`${path}.source_id duplicates ${source.source_id}`);
  sourceIds.add(source.source_id);
});

const requestIds = new Set();
snapshot.requests.forEach((request, index) => {
  const path = `root.requests[${index}]`;
  if (!isObject(request)) fail(`${path} must be an object`);
  for (const key of ["request_id", "title"]) requireString(request, key, path);
  requireEnum(request, "status", REQUEST_STATUSES, path);
  requireEnum(request, "trend", TRENDS, path);
  for (const key of ["frequency", "weighted_score"]) requireNumber(request, key, path);
  if (!Array.isArray(request.representative_feedback_ids)) fail(`${path}.representative_feedback_ids must be an array`);
  if (!Array.isArray(request.decision_history)) fail(`${path}.decision_history must be an array`);
  if (requestIds.has(request.request_id)) fail(`${path}.request_id duplicates ${request.request_id}`);
  requestIds.add(request.request_id);
});

const feedbackIds = new Set();
snapshot.feedback.forEach((item, index) => {
  const path = `root.feedback[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["feedback_id", "source_id", "text", "received_at"]) requireString(item, key, path);
  requireEnum(item, "channel", CHANNELS, path);
  requireEnum(item, "sentiment", SENTIMENTS, path);
  requireEnum(item, "triage", TRIAGE, path);
  if (!isObject(item.user)) fail(`${path}.user must be an object`);
  requireNumber(item.user, "weight", `${path}.user`);
  if (feedbackIds.has(item.feedback_id)) fail(`${path}.feedback_id duplicates ${item.feedback_id}`);
  feedbackIds.add(item.feedback_id);
  if (!sourceIds.has(item.source_id)) fail(`${path}.source_id does not match a source: ${item.source_id}`);
  if (item.request_id && !requestIds.has(item.request_id))
    fail(`${path}.request_id does not match a request: ${item.request_id}`);
});

snapshot.requests.forEach((request, index) => {
  const path = `root.requests[${index}]`;
  for (const id of request.representative_feedback_ids) {
    if (!feedbackIds.has(id)) fail(`${path}.representative_feedback_ids references unknown feedback: ${id}`);
  }
});

for (const laneKey of LANES) {
  snapshot.roadmap[laneKey].forEach((item, index) => {
    const path = `root.roadmap.${laneKey}[${index}]`;
    if (!isObject(item)) fail(`${path} must be an object`);
    for (const key of ["item_id", "title"]) requireString(item, key, path);
    if (item.request_id && !requestIds.has(item.request_id))
      fail(`${path}.request_id does not match a request: ${item.request_id}`);
  });
}

const proposalIds = new Set();
const proposalRefs = new Set();
snapshot.proposals.forEach((proposal, index) => {
  const path = `root.proposals[${index}]`;
  if (!isObject(proposal)) fail(`${path} must be an object`);
  for (const key of ["proposal_id", "title", "reason"]) requireString(proposal, key, path);
  requireNumber(proposal, "ref", path);
  requireEnum(proposal, "type", PROPOSAL_TYPES, path);
  requireEnum(proposal, "status", PROPOSAL_STATUSES, path);
  if (proposalIds.has(proposal.proposal_id)) fail(`${path}.proposal_id duplicates ${proposal.proposal_id}`);
  proposalIds.add(proposal.proposal_id);
  if (proposalRefs.has(proposal.ref)) fail(`${path}.ref duplicates #${proposal.ref}`);
  proposalRefs.add(proposal.ref);
  if (proposal.request_id && !requestIds.has(proposal.request_id))
    fail(`${path}.request_id does not match a request: ${proposal.request_id}`);
  if (proposal.target_lane && !LANES.includes(proposal.target_lane))
    fail(`${path}.target_lane must be one of ${LANES.join("|")}`);
  for (const id of proposal.request_ids || []) {
    if (!requestIds.has(id)) fail(`${path}.request_ids references unknown request: ${id}`);
  }
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["at", "actor", "action", "detail"]) requireString(entry, key, path);
});

console.log(`OK: ${target}`);
