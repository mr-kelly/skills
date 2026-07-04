#!/usr/bin/env node
// Validates an ads snapshot against references/ads-schema.md before the UI
// or execution scripts rely on it.
//
// Usage: node scripts/validate_ui_schema.mjs [path/to/ads_snapshot.json]
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/ads_snapshot.json", import.meta.url).pathname;

const ANOMALY_TYPES = new Set(["acos_breach", "budget_exhausted", "zero_conversion_spend", "cpc_spike", "rejected"]);
const ANOMALY_STATES = new Set(["open", "actioned", "dismissed", "resolved"]);
const SEVERITIES = new Set(["critical", "warning", "info"]);
const ADJUSTMENT_TYPES = new Set(["negative_keyword", "bid_down", "bid_up", "pause_target", "budget_shift", "creative_refresh"]);
const ADJUSTMENT_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const CAMPAIGN_STATUSES = new Set(["active", "paused", "rejected"]);
const PLATFORM_IDS = new Set(["amazon", "meta", "tiktok", "google"]);

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
requireString(snapshot, "currency", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "spend_mtd", "spend_last_month", "revenue_mtd", "spend_14d", "revenue_14d",
  "blended_roas", "blended_acos_pct", "acos_target_pct", "conversions_14d",
  "campaigns_total", "campaigns_active", "anomalies_open", "anomalies_critical",
  "adjustments_needing_review", "budget_at_risk_today"
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["platforms", "campaigns", "anomalies", "adjustments", "sync_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const platformIds = new Set();
snapshot.platforms.forEach((platform, index) => {
  const path = `root.platforms[${index}]`;
  if (!isObject(platform)) fail(`${path} must be an object`);
  for (const key of ["platform_id", "name", "status"]) requireString(platform, key, path);
  if (!PLATFORM_IDS.has(platform.platform_id)) fail(`${path}.platform_id must be one of: ${[...PLATFORM_IDS].join(", ")}`);
  if (platformIds.has(platform.platform_id)) fail(`${path}.platform_id duplicates ${platform.platform_id}`);
  platformIds.add(platform.platform_id);
});

const campaignIds = new Set();
const targetIds = new Set();
snapshot.campaigns.forEach((campaign, index) => {
  const path = `root.campaigns[${index}]`;
  if (!isObject(campaign)) fail(`${path} must be an object`);
  for (const key of ["campaign_id", "platform", "name", "status", "currency"]) requireString(campaign, key, path);
  if (!CAMPAIGN_STATUSES.has(campaign.status)) fail(`${path}.status must be one of: ${[...CAMPAIGN_STATUSES].join(", ")}`);
  if (!platformIds.has(campaign.platform)) fail(`${path}.platform does not match a platform: ${campaign.platform}`);
  if (campaignIds.has(campaign.campaign_id)) fail(`${path}.campaign_id duplicates ${campaign.campaign_id}`);
  campaignIds.add(campaign.campaign_id);
  for (const key of ["daily_budget", "budget_spent_today_pct", "acos_target_pct"]) requireNumber(campaign, key, path);
  if (!Array.isArray(campaign.daily)) fail(`${path}.daily must be an array`);
  const dates = new Set();
  campaign.daily.forEach((day, dayIndex) => {
    const dayPath = `${path}.daily[${dayIndex}]`;
    if (!isObject(day)) fail(`${dayPath} must be an object`);
    requireString(day, "date", dayPath);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) fail(`${dayPath}.date must be YYYY-MM-DD`);
    if (dates.has(day.date)) fail(`${dayPath}.date duplicates ${day.date}`);
    dates.add(day.date);
    for (const key of ["spend", "impressions", "clicks", "conversions", "revenue"]) requireNumber(day, key, dayPath);
  });
  if (!Array.isArray(campaign.targets)) fail(`${path}.targets must be an array`);
  campaign.targets.forEach((term, termIndex) => {
    const termPath = `${path}.targets[${termIndex}]`;
    if (!isObject(term)) fail(`${termPath} must be an object`);
    for (const key of ["target_id", "type", "text", "state"]) requireString(term, key, termPath);
    for (const key of ["spend_14d", "clicks", "conversions", "revenue"]) requireNumber(term, key, termPath);
    if (targetIds.has(term.target_id)) fail(`${termPath}.target_id duplicates ${term.target_id}`);
    targetIds.add(term.target_id);
  });
  if (!isObject(campaign.totals_7d)) fail(`${path}.totals_7d must be an object (run recomputeDerived)`);
  for (const key of ["spend", "clicks", "conversions", "revenue", "roas", "acos_pct"]) requireNumber(campaign.totals_7d, key, `${path}.totals_7d`);
});

const adjustmentIds = new Set();
const adjustmentRefs = new Set();
snapshot.adjustments.forEach((adjustment, index) => {
  const path = `root.adjustments[${index}]`;
  if (!isObject(adjustment)) fail(`${path} must be an object`);
  for (const key of ["adjustment_id", "type", "title", "status", "campaign_id", "platform", "reason", "current_value", "proposed_value"]) {
    requireString(adjustment, key, path);
  }
  requireNumber(adjustment, "ref", path);
  if (!ADJUSTMENT_TYPES.has(adjustment.type)) fail(`${path}.type must be one of: ${[...ADJUSTMENT_TYPES].join(", ")}`);
  if (!ADJUSTMENT_STATUSES.has(adjustment.status)) fail(`${path}.status must be one of: ${[...ADJUSTMENT_STATUSES].join(", ")}`);
  if (!campaignIds.has(adjustment.campaign_id)) fail(`${path}.campaign_id does not match a campaign: ${adjustment.campaign_id}`);
  if (!Array.isArray(adjustment.evidence)) fail(`${path}.evidence must be an array`);
  if (!isObject(adjustment.target)) fail(`${path}.target must be an object`);
  if (adjustmentIds.has(adjustment.adjustment_id)) fail(`${path}.adjustment_id duplicates ${adjustment.adjustment_id}`);
  adjustmentIds.add(adjustment.adjustment_id);
  if (adjustmentRefs.has(adjustment.ref)) fail(`${path}.ref duplicates ${adjustment.ref}`);
  adjustmentRefs.add(adjustment.ref);
  if (adjustment.status === "done" && !isObject(adjustment.execution)) fail(`${path}.execution must be an object when status is done`);
});

const anomalyIds = new Set();
snapshot.anomalies.forEach((anomaly, index) => {
  const path = `root.anomalies[${index}]`;
  if (!isObject(anomaly)) fail(`${path} must be an object`);
  for (const key of ["anomaly_id", "type", "severity", "state", "campaign_id", "platform", "evidence"]) requireString(anomaly, key, path);
  if (!ANOMALY_TYPES.has(anomaly.type)) fail(`${path}.type must be one of: ${[...ANOMALY_TYPES].join(", ")}`);
  if (!ANOMALY_STATES.has(anomaly.state)) fail(`${path}.state must be one of: ${[...ANOMALY_STATES].join(", ")}`);
  if (!SEVERITIES.has(anomaly.severity)) fail(`${path}.severity must be one of: ${[...SEVERITIES].join(", ")}`);
  if (!campaignIds.has(anomaly.campaign_id)) fail(`${path}.campaign_id does not match a campaign: ${anomaly.campaign_id}`);
  if (anomaly.adjustment_id && !adjustmentIds.has(anomaly.adjustment_id)) fail(`${path}.adjustment_id does not match an adjustment: ${anomaly.adjustment_id}`);
  if (anomalyIds.has(anomaly.anomaly_id)) fail(`${path}.anomaly_id duplicates ${anomaly.anomaly_id}`);
  anomalyIds.add(anomaly.anomaly_id);
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["sync_id", "at", "kind", "message"]) requireString(entry, key, path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
