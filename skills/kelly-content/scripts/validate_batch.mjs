#!/usr/bin/env node
import { currentBatchPath } from "../lib/paths.mjs";
import { readJson } from "../lib/common.mjs";

const allowedStatuses = new Set(["needs_review", "to_approve", "approved", "done", "blocked"]);
const batchPath = process.argv[2] || currentBatchPath;
const batch = await readJson(batchPath);

function fail(message) {
  console.error(`Invalid content batch: ${message}`);
  process.exit(1);
}

if (!batch || typeof batch !== "object") fail("batch is missing or not JSON");
if (!batch.batch_id) fail("missing batch_id");
if (!Array.isArray(batch.items)) fail("items must be an array");
if (!batch.metrics || typeof batch.metrics !== "object") fail("missing metrics object");

const seen = new Set();
for (const [index, item] of batch.items.entries()) {
  if (!item.id) fail(`item ${index + 1} missing id`);
  if (seen.has(item.id)) fail(`duplicate item id: ${item.id}`);
  seen.add(item.id);
  if (!item.title) fail(`${item.id} missing title`);
  if (!item.channel) fail(`${item.id} missing channel`);
  if (!allowedStatuses.has(item.status)) fail(`${item.id} has invalid status: ${item.status}`);
  if (typeof item.body !== "string") fail(`${item.id} body must be a string`);
}

console.log(`OK: ${batch.items.length} content items in ${batch.batch_id}`);
