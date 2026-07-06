#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/seo_snapshot.json", import.meta.url).pathname;

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

function requireMetricBlock(obj, path) {
  if (!isObject(obj)) fail(`${path} must be an object`);
  for (const key of ["clicks", "impressions", "ctr", "position"]) requireNumber(obj, key, path);
}

const OPPORTUNITY_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const OPPORTUNITY_TYPES = new Set(["title_meta_rewrite", "internal_links", "content_brief", "fix_page_issue"]);

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
if (!isObject(snapshot.range) || !isObject(snapshot.range.current) || !isObject(snapshot.range.previous)) {
  fail("root.range must contain current and previous objects");
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "site_count",
  "query_count",
  "page_count",
  "opportunity_count",
  "clicks",
  "impressions",
  "ctr",
  "position",
  "prev_clicks",
  "prev_impressions",
  "prev_ctr",
  "prev_position",
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
  if (!OPPORTUNITY_STATUSES.has(opportunity.status))
    fail(`${path}.status is not a workflow state: ${opportunity.status}`);
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

// ── GEO / AI-search (optional; validated when present) ────────────────────────

const AI_ENGINES = new Set(["chatgpt", "perplexity", "gemini", "claude", "copilot"]);
const SENTIMENTS = new Set(["positive", "neutral", "negative"]);
const GEO_TYPES = new Set(["citable_rewrite", "quotable_stats", "qa_block", "schema_markup"]);
const GATE_VERDICTS = new Set(["SHIP", "FIX", "BLOCK"]);
const CHECK_RESULTS = new Set(["pass", "warn", "fail"]);
const ENTITY_STATUSES = new Set(["present", "partial", "missing"]);

if (snapshot.ai_visibility !== null && snapshot.ai_visibility !== undefined) {
  const vis = snapshot.ai_visibility;
  const base = "root.ai_visibility";
  if (!isObject(vis)) fail(`${base} must be an object or null`);
  requireString(vis, "brand", base);
  requireNumber(vis, "score", base);
  requireNumber(vis, "prev_score", base);
  if (!Array.isArray(vis.engines) || !vis.engines.length) fail(`${base}.engines must be a non-empty array`);
  vis.engines.forEach((engine, index) => {
    if (!AI_ENGINES.has(engine)) fail(`${base}.engines[${index}] is unknown: ${engine}`);
  });
  if (!Array.isArray(vis.prompts)) fail(`${base}.prompts must be an array`);
  const promptIds = new Set();
  vis.prompts.forEach((prompt, index) => {
    const path = `${base}.prompts[${index}]`;
    if (!isObject(prompt)) fail(`${path} must be an object`);
    for (const key of ["prompt_id", "prompt", "intent"]) requireString(prompt, key, path);
    if (promptIds.has(prompt.prompt_id)) fail(`${path}.prompt_id duplicates ${prompt.prompt_id}`);
    promptIds.add(prompt.prompt_id);
    if (!Array.isArray(prompt.mentions)) fail(`${path}.mentions must be an array`);
    prompt.mentions.forEach((mention, mIndex) => {
      const mPath = `${path}.mentions[${mIndex}]`;
      if (!isObject(mention)) fail(`${mPath} must be an object`);
      if (!AI_ENGINES.has(mention.engine)) fail(`${mPath}.engine is unknown: ${mention.engine}`);
      if (typeof mention.mentioned !== "boolean") fail(`${mPath}.mentioned must be a boolean`);
      if (mention.mentioned) {
        if (mention.position !== null && typeof mention.position !== "number") {
          fail(`${mPath}.position must be a number or null`);
        }
        if (mention.sentiment !== null && !SENTIMENTS.has(mention.sentiment)) {
          fail(`${mPath}.sentiment is unknown: ${mention.sentiment}`);
        }
      }
    });
    if (!Array.isArray(prompt.trend)) fail(`${path}.trend must be an array`);
  });
}

function validateGate(gate, path) {
  if (!isObject(gate)) fail(`${path} must be an object`);
  if (!GATE_VERDICTS.has(gate.verdict)) fail(`${path}.verdict is unknown: ${gate.verdict}`);
  requireNumber(gate, "score", path);
  if (!Array.isArray(gate.checks)) fail(`${path}.checks must be an array`);
  gate.checks.forEach((check, index) => {
    const cPath = `${path}.checks[${index}]`;
    if (!isObject(check)) fail(`${cPath} must be an object`);
    for (const key of ["id", "label"]) requireString(check, key, cPath);
    if (!CHECK_RESULTS.has(check.result)) fail(`${cPath}.result is unknown: ${check.result}`);
  });
}

if (snapshot.geo_opportunities !== undefined) {
  if (!Array.isArray(snapshot.geo_opportunities)) fail("root.geo_opportunities must be an array");
  const geoIds = new Set();
  const geoRefs = new Set();
  snapshot.geo_opportunities.forEach((opportunity, index) => {
    const path = `root.geo_opportunities[${index}]`;
    if (!isObject(opportunity)) fail(`${path} must be an object`);
    for (const key of ["id", "type", "title", "target_prompt", "reason", "expected_impact", "status", "created_at"]) {
      requireString(opportunity, key, path);
    }
    requireNumber(opportunity, "ref", path);
    if (typeof opportunity.draft !== "string") fail(`${path}.draft must be a string`);
    if (!OPPORTUNITY_STATUSES.has(opportunity.status)) {
      fail(`${path}.status is not a workflow state: ${opportunity.status}`);
    }
    if (!GEO_TYPES.has(opportunity.type)) fail(`${path}.type is unknown: ${opportunity.type}`);
    if (!Array.isArray(opportunity.grounding)) fail(`${path}.grounding must be an array`);
    validateGate(opportunity.gate, `${path}.gate`);
    // Hard-gate invariant: a BLOCKed change must never be approved/done.
    if (opportunity.gate.verdict === "BLOCK" && (opportunity.status === "approved" || opportunity.status === "done")) {
      fail(`${path} is geo-qa BLOCK but status is ${opportunity.status}`);
    }
    if (geoIds.has(opportunity.id)) fail(`${path}.id duplicates ${opportunity.id}`);
    geoIds.add(opportunity.id);
    if (geoRefs.has(opportunity.ref)) fail(`${path}.ref duplicates #${opportunity.ref}`);
    geoRefs.add(opportunity.ref);
  });
}

if (snapshot.entity_signals !== null && snapshot.entity_signals !== undefined) {
  const readiness = snapshot.entity_signals;
  const base = "root.entity_signals";
  if (!isObject(readiness)) fail(`${base} must be an object or null`);
  requireString(readiness, "brand", base);
  requireNumber(readiness, "score", base);
  if (!Array.isArray(readiness.signals)) fail(`${base}.signals must be an array`);
  const signalIds = new Set();
  readiness.signals.forEach((signal, index) => {
    const path = `${base}.signals[${index}]`;
    if (!isObject(signal)) fail(`${path} must be an object`);
    for (const key of ["id", "label", "category", "detail"]) requireString(signal, key, path);
    if (!ENTITY_STATUSES.has(signal.status)) fail(`${path}.status is unknown: ${signal.status}`);
    if (typeof signal.fix !== "string") fail(`${path}.fix must be a string`);
    if (signalIds.has(signal.id)) fail(`${path}.id duplicates ${signal.id}`);
    signalIds.add(signal.id);
  });
}

console.log(`OK: ${target}`);
