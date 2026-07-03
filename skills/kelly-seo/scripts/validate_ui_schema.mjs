#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/seo_snapshot.json", import.meta.url).pathname;

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

function requireMetricBlock(obj, path) {
  if (!isObject(obj)) fail(`${path} must be an object`);
  for (const key of ["clicks", "impressions", "ctr", "position"]) requireNumber(obj, key, path);
}

const OPPORTUNITY_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const OPPORTUNITY_TYPES = new Set(["title_meta_rewrite", "internal_links", "content_brief", "fix_page_issue"]);

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
if (!isObject(snapshot.range) || !isObject(snapshot.range.current) || !isObject(snapshot.range.previous)) {
  fail("root.range must contain current and previous objects");
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "site_count", "query_count", "page_count", "opportunity_count",
  "clicks", "impressions", "ctr", "position",
  "prev_clicks", "prev_impressions", "prev_ctr", "prev_position"
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["sites", "daily", "queries", "pages", "opportunities", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const siteIds = new Set();
snapshot.sites.forEach((site, index) => {
  const path = `root.sites[${index}]`;
  if (!isObject(site)) fail(`${path} must be an object`);
  for (const key of ["site_id", "property_url", "verification_type", "status"]) requireString(site, key, path);
  if (siteIds.has(site.site_id)) fail(`${path}.site_id duplicates ${site.site_id}`);
  siteIds.add(site.site_id);
  requireMetricBlock(site.totals, `${path}.totals`);
  requireMetricBlock(site.previous, `${path}.previous`);
});

snapshot.daily.forEach((point, index) => {
  const path = `root.daily[${index}]`;
  if (!isObject(point)) fail(`${path} must be an object`);
  for (const key of ["date", "site_id"]) requireString(point, key, path);
  for (const key of ["clicks", "impressions"]) requireNumber(point, key, path);
  if (!siteIds.has(point.site_id)) fail(`${path}.site_id does not match a site: ${point.site_id}`);
});

const queryIds = new Set();
snapshot.queries.forEach((query, index) => {
  const path = `root.queries[${index}]`;
  if (!isObject(query)) fail(`${path} must be an object`);
  for (const key of ["query_id", "site_id", "query"]) requireString(query, key, path);
  for (const key of ["clicks", "impressions", "ctr", "position"]) requireNumber(query, key, path);
  requireMetricBlock(query.previous, `${path}.previous`);
  if (!Array.isArray(query.badges)) fail(`${path}.badges must be an array`);
  if (!Array.isArray(query.top_pages)) fail(`${path}.top_pages must be an array`);
  if (!Array.isArray(query.trend)) fail(`${path}.trend must be an array`);
  if (queryIds.has(query.query_id)) fail(`${path}.query_id duplicates ${query.query_id}`);
  queryIds.add(query.query_id);
  if (!siteIds.has(query.site_id)) fail(`${path}.site_id does not match a site: ${query.site_id}`);
});

const pageIds = new Set();
snapshot.pages.forEach((page, index) => {
  const path = `root.pages[${index}]`;
  if (!isObject(page)) fail(`${path} must be an object`);
  for (const key of ["page_id", "site_id", "url"]) requireString(page, key, path);
  for (const key of ["clicks", "impressions", "ctr", "position"]) requireNumber(page, key, path);
  requireMetricBlock(page.previous, `${path}.previous`);
  if (!Array.isArray(page.issues)) fail(`${path}.issues must be an array`);
  if (!Array.isArray(page.top_queries)) fail(`${path}.top_queries must be an array`);
  if (!Array.isArray(page.trend)) fail(`${path}.trend must be an array`);
  if (pageIds.has(page.page_id)) fail(`${path}.page_id duplicates ${page.page_id}`);
  pageIds.add(page.page_id);
  if (!siteIds.has(page.site_id)) fail(`${path}.site_id does not match a site: ${page.site_id}`);
});

const opportunityIds = new Set();
const opportunityRefs = new Set();
snapshot.opportunities.forEach((opportunity, index) => {
  const path = `root.opportunities[${index}]`;
  if (!isObject(opportunity)) fail(`${path} must be an object`);
  for (const key of ["id", "site_id", "type", "title", "reason", "expected_impact", "status", "created_at"]) {
    requireString(opportunity, key, path);
  }
  requireNumber(opportunity, "ref", path);
  if (typeof opportunity.draft !== "string") fail(`${path}.draft must be a string`);
  if (!OPPORTUNITY_STATUSES.has(opportunity.status)) fail(`${path}.status is not a workflow state: ${opportunity.status}`);
  if (!OPPORTUNITY_TYPES.has(opportunity.type)) fail(`${path}.type is unknown: ${opportunity.type}`);
  if (!siteIds.has(opportunity.site_id)) fail(`${path}.site_id does not match a site: ${opportunity.site_id}`);
  if (opportunityIds.has(opportunity.id)) fail(`${path}.id duplicates ${opportunity.id}`);
  opportunityIds.add(opportunity.id);
  if (opportunityRefs.has(opportunity.ref)) fail(`${path}.ref duplicates #${opportunity.ref}`);
  opportunityRefs.add(opportunity.ref);
  if (opportunity.decision !== null && opportunity.decision !== undefined) {
    if (!isObject(opportunity.decision)) fail(`${path}.decision must be an object or null`);
    requireString(opportunity.decision, "action", `${path}.decision`);
  }
  if (opportunity.execution !== null && opportunity.execution !== undefined) {
    if (!isObject(opportunity.execution)) fail(`${path}.execution must be an object or null`);
    for (const key of ["status", "operation"]) requireString(opportunity.execution, key, `${path}.execution`);
  }
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
