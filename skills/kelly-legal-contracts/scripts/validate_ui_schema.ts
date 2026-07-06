#!/usr/bin/env node
// Validates app/.data/contract_snapshot.json (or a path passed as argv[2])
// against the schema in references/contracts-schema.md. Run this before relying
// on a snapshot in the UI or executing decisions.
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/contract_snapshot.json", import.meta.url).pathname;

const PLATFORMS = new Set(["amazon", "shopify", "tiktok_shop", "ebay", "nda", "msa", "dpa", "sow"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const RESULTS = new Set(["pass", "warn", "fail"]);
const SOURCES = new Set(["manual", "kelly_picks"]);
const IMAGE_STATUSES = new Set(["ready", "missing", "needs_edit"]);

function fail(message: string): never {
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

let snapshot: any;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.seller)) fail("root.seller must be an object");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "product_count",
  "draft_count",
  "drafts_needs_review",
  "drafts_approved",
  "drafts_in_revision",
  "checks_failed",
  "compliance_pass_rate",
  "exported_this_week",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!isObject(snapshot.metrics.drafts_by_platform)) fail("root.metrics.drafts_by_platform must be an object");
for (const key of ["products", "drafts", "rules", "checks", "review_items", "activity_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const productIds = new Set();
snapshot.products.forEach((product, index) => {
  const path = `root.products[${index}]`;
  if (!isObject(product)) fail(`${path} must be an object`);
  for (const key of ["product_id", "name", "sku", "source"]) requireString(product, key, path);
  requireNumber(product, "ref", path);
  if (!SOURCES.has(product.source)) fail(`${path}.source is invalid: ${product.source}`);
  if (productIds.has(product.product_id)) fail(`${path}.product_id duplicates ${product.product_id}`);
  productIds.add(product.product_id);
  for (const key of ["platforms", "specs", "features", "keywords", "images"]) {
    if (product[key] !== undefined && !Array.isArray(product[key])) fail(`${path}.${key} must be an array`);
  }
  (product.platforms || []).forEach((platform) => {
    if (!PLATFORMS.has(platform)) fail(`${path}.platforms contains unknown platform: ${platform}`);
  });
  (product.images || []).forEach((image, imageIndex) => {
    if (!isObject(image)) fail(`${path}.images[${imageIndex}] must be an object`);
    requireString(image, "name", `${path}.images[${imageIndex}]`);
    if (!IMAGE_STATUSES.has(image.status)) fail(`${path}.images[${imageIndex}].status is invalid: ${image.status}`);
  });
  (product.specs || []).forEach((spec, specIndex) => {
    if (!isObject(spec)) fail(`${path}.specs[${specIndex}] must be an object`);
    requireString(spec, "name", `${path}.specs[${specIndex}]`);
    requireString(spec, "value", `${path}.specs[${specIndex}]`);
  });
});

const draftIds = new Set();
snapshot.drafts.forEach((draft, index) => {
  const path = `root.drafts[${index}]`;
  if (!isObject(draft)) fail(`${path} must be an object`);
  for (const key of ["draft_id", "product_id", "platform", "status"]) requireString(draft, key, path);
  requireNumber(draft, "ref", path);
  requireNumber(draft, "compliance_score", path);
  if (!PLATFORMS.has(draft.platform)) fail(`${path}.platform is invalid: ${draft.platform}`);
  if (!STATUSES.has(draft.status)) fail(`${path}.status is invalid: ${draft.status}`);
  if (draftIds.has(draft.draft_id)) fail(`${path}.draft_id duplicates ${draft.draft_id}`);
  draftIds.add(draft.draft_id);
  if (!productIds.has(draft.product_id)) fail(`${path}.product_id does not match a product: ${draft.product_id}`);
  if (!isObject(draft.fields)) fail(`${path}.fields must be an object`);
  if (draft.fields.bullets !== undefined && !Array.isArray(draft.fields.bullets))
    fail(`${path}.fields.bullets must be an array`);
  if (draft.fields.selling_points !== undefined && !Array.isArray(draft.fields.selling_points))
    fail(`${path}.fields.selling_points must be an array`);
});

const ruleIds = new Set();
snapshot.rules.forEach((rule, index) => {
  const path = `root.rules[${index}]`;
  if (!isObject(rule)) fail(`${path} must be an object`);
  for (const key of ["rule_id", "name", "severity"]) requireString(rule, key, path);
  if (ruleIds.has(rule.rule_id)) fail(`${path}.rule_id duplicates ${rule.rule_id}`);
  ruleIds.add(rule.rule_id);
});

const checkIds = new Set();
snapshot.checks.forEach((check, index) => {
  const path = `root.checks[${index}]`;
  if (!isObject(check)) fail(`${path} must be an object`);
  for (const key of ["check_id", "draft_id", "rule_id", "severity", "result"]) requireString(check, key, path);
  if (!RESULTS.has(check.result)) fail(`${path}.result is invalid: ${check.result}`);
  if (checkIds.has(check.check_id)) fail(`${path}.check_id duplicates ${check.check_id}`);
  checkIds.add(check.check_id);
  if (!draftIds.has(check.draft_id)) fail(`${path}.draft_id does not match a draft: ${check.draft_id}`);
  if (ruleIds.size && !ruleIds.has(check.rule_id)) fail(`${path}.rule_id does not match a rule: ${check.rule_id}`);
});

const reviewIds = new Set();
snapshot.review_items.forEach((item, index) => {
  const path = `root.review_items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["review_id", "draft_id", "status"]) requireString(item, key, path);
  requireNumber(item, "ref", path);
  if (!STATUSES.has(item.status)) fail(`${path}.status is invalid: ${item.status}`);
  if (reviewIds.has(item.review_id)) fail(`${path}.review_id duplicates ${item.review_id}`);
  reviewIds.add(item.review_id);
  if (!draftIds.has(item.draft_id)) fail(`${path}.draft_id does not match a draft: ${item.draft_id}`);
  if (item.suggestions !== undefined && !Array.isArray(item.suggestions)) fail(`${path}.suggestions must be an array`);
});

snapshot.activity_log.forEach((entry, index) => {
  const path = `root.activity_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["id", "at", "actor", "detail"]) requireString(entry, key, path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
