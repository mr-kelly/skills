#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/ops_snapshot.json", import.meta.url).pathname;

const EXPIRY_TYPES = new Set(["domain", "ssl_cert", "api_key_rotation", "plan_renewal"]);
const ACTION_TYPES = new Set(["renew_domain", "rotate_key", "investigate_spend", "restart_service", "ack_incident"]);
const ACTION_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const SERVICE_STATUSES = new Set(["up", "degraded", "down", "unknown"]);
const EVENT_SEVERITIES = new Set(["info", "warning", "error"]);

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
requireString(snapshot, "currency", "root");
if (!isObject(snapshot.checks)) fail("root.checks must be an object");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "services_total",
  "services_up",
  "services_degraded",
  "services_down",
  "certs_ok",
  "certs_expiring",
  "domains_ok",
  "domains_expiring",
  "expiring_14d",
  "actions_needing_review",
  "spend_mtd",
  "spend_last_month",
  "spend_anomalies",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.services)) fail("root.services must be an array");
if (!Array.isArray(snapshot.expiries)) fail("root.expiries must be an array");
if (!isObject(snapshot.spend)) fail("root.spend must be an object");
if (!Array.isArray(snapshot.spend.providers)) fail("root.spend.providers must be an array");
if (!Array.isArray(snapshot.spend.products)) fail("root.spend.products must be an array");
if (!Array.isArray(snapshot.actions)) fail("root.actions must be an array");
if (!Array.isArray(snapshot.events)) fail("root.events must be an array");
if (!Array.isArray(snapshot.warnings)) fail("root.warnings must be an array");

const serviceIds = new Set();
snapshot.services.forEach((service, index) => {
  const path = `root.services[${index}]`;
  if (!isObject(service)) fail(`${path} must be an object`);
  for (const key of ["service_id", "name", "url", "status"]) requireString(service, key, path);
  if (!SERVICE_STATUSES.has(service.status)) fail(`${path}.status invalid: ${service.status}`);
  requireNumber(service, "latency_ms", path);
  requireNumber(service, "uptime_7d", path);
  if (serviceIds.has(service.service_id)) fail(`${path}.service_id duplicates ${service.service_id}`);
  serviceIds.add(service.service_id);
  if (service.ssl !== null && service.ssl !== undefined) {
    if (!isObject(service.ssl)) fail(`${path}.ssl must be an object or null`);
    requireNumber(service.ssl, "days_left", `${path}.ssl`);
  }
  if (!Array.isArray(service.history)) fail(`${path}.history must be an array`);
  service.history.forEach((entry, entryIndex) => {
    const entryPath = `${path}.history[${entryIndex}]`;
    if (!isObject(entry)) fail(`${entryPath} must be an object`);
    requireString(entry, "at", entryPath);
    requireString(entry, "status", entryPath);
    requireNumber(entry, "latency_ms", entryPath);
  });
  if (!Array.isArray(service.warnings)) fail(`${path}.warnings must be an array`);
});

const actionIds = new Set();
const actionRefs = new Set();
snapshot.actions.forEach((action, index) => {
  const path = `root.actions[${index}]`;
  if (!isObject(action)) fail(`${path} must be an object`);
  for (const key of ["action_id", "type", "title", "status", "reason"]) requireString(action, key, path);
  requireNumber(action, "ref", path);
  if (!ACTION_TYPES.has(action.type)) fail(`${path}.type invalid: ${action.type}`);
  if (!ACTION_STATUSES.has(action.status)) fail(`${path}.status invalid: ${action.status}`);
  if (!Array.isArray(action.evidence)) fail(`${path}.evidence must be an array`);
  if (!Array.isArray(action.plan)) fail(`${path}.plan must be an array`);
  if (!isObject(action.target)) fail(`${path}.target must be an object`);
  if (actionIds.has(action.action_id)) fail(`${path}.action_id duplicates ${action.action_id}`);
  actionIds.add(action.action_id);
  if (actionRefs.has(action.ref)) fail(`${path}.ref duplicates ${action.ref}`);
  actionRefs.add(action.ref);
  if (action.decision !== null && action.decision !== undefined) {
    if (!isObject(action.decision)) fail(`${path}.decision must be an object or null`);
    requireString(action.decision, "verdict", `${path}.decision`);
  }
});

const expiryIds = new Set();
snapshot.expiries.forEach((expiry, index) => {
  const path = `root.expiries[${index}]`;
  if (!isObject(expiry)) fail(`${path} must be an object`);
  for (const key of ["expiry_id", "type", "item"]) requireString(expiry, key, path);
  if (!EXPIRY_TYPES.has(expiry.type)) fail(`${path}.type invalid: ${expiry.type}`);
  requireNumber(expiry, "days_left", path);
  if (typeof expiry.auto_renew !== "boolean") fail(`${path}.auto_renew must be a boolean`);
  if (expiryIds.has(expiry.expiry_id)) fail(`${path}.expiry_id duplicates ${expiry.expiry_id}`);
  expiryIds.add(expiry.expiry_id);
  if (expiry.action_id && !actionIds.has(expiry.action_id))
    fail(`${path}.action_id does not match an action: ${expiry.action_id}`);
});

const providerIds = new Set();
snapshot.spend.providers.forEach((provider, index) => {
  const path = `root.spend.providers[${index}]`;
  if (!isObject(provider)) fail(`${path} must be an object`);
  for (const key of ["provider_id", "name"]) requireString(provider, key, path);
  for (const key of ["mtd", "last_month", "delta_pct"]) requireNumber(provider, key, path);
  if (typeof provider.anomaly !== "boolean") fail(`${path}.anomaly must be a boolean`);
  if (providerIds.has(provider.provider_id)) fail(`${path}.provider_id duplicates ${provider.provider_id}`);
  providerIds.add(provider.provider_id);
  if (provider.action_id && !actionIds.has(provider.action_id))
    fail(`${path}.action_id does not match an action: ${provider.action_id}`);
});

snapshot.spend.products.forEach((product, index) => {
  const path = `root.spend.products[${index}]`;
  if (!isObject(product)) fail(`${path} must be an object`);
  requireString(product, "product", path);
  for (const key of ["mtd", "last_month"]) requireNumber(product, key, path);
});

const eventIds = new Set();
snapshot.events.forEach((event, index) => {
  const path = `root.events[${index}]`;
  if (!isObject(event)) fail(`${path} must be an object`);
  for (const key of ["event_id", "at", "severity", "kind", "message"]) requireString(event, key, path);
  if (!EVENT_SEVERITIES.has(event.severity)) fail(`${path}.severity invalid: ${event.severity}`);
  if (eventIds.has(event.event_id)) fail(`${path}.event_id duplicates ${event.event_id}`);
  eventIds.add(event.event_id);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
