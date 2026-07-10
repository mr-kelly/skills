#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/snapshot.json", import.meta.url).pathname;

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

let snapshot: JsonObject;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "snapshot_id", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "base_currency", "root");
if (!Array.isArray(snapshot.services)) fail("root.services must be an array");
if (!Array.isArray(snapshot.models)) fail("root.models must be an array");
if (!Array.isArray(snapshot.routes)) fail("root.routes must be an array");
if (!Array.isArray(snapshot.spend_trend)) fail("root.spend_trend must be an array");
if (!Array.isArray(snapshot.anomalies)) fail("root.anomalies must be an array");

if (!isObject(snapshot.totals)) fail("root.totals must be an object");
for (const key of ["calls_today", "cost_today", "cost_7d_avg", "error_rate_today"]) {
  requireNumber(snapshot.totals, key, "root.totals");
}

const serviceIds = new Set();
snapshot.services.forEach((service: JsonObject, index: number) => {
  const path = `root.services[${index}]`;
  if (!isObject(service)) fail(`${path} must be an object`);
  requireString(service, "service_id", path);
  requireString(service, "display_name", path);
  if (serviceIds.has(service.service_id)) fail(`${path}.service_id duplicates ${service.service_id}`);
  serviceIds.add(service.service_id);
});

const modelIds = new Set();
snapshot.models.forEach((model: JsonObject, index: number) => {
  const path = `root.models[${index}]`;
  if (!isObject(model)) fail(`${path} must be an object`);
  requireString(model, "model_id", path);
  requireString(model, "display_name", path);
  requireEnum(model, "tier", path, ["internal", "external"]);
  if (modelIds.has(model.model_id)) fail(`${path}.model_id duplicates ${model.model_id}`);
  modelIds.add(model.model_id);
});

const routeIds = new Set();
snapshot.routes.forEach((route: JsonObject, index: number) => {
  const path = `root.routes[${index}]`;
  if (!isObject(route)) fail(`${path} must be an object`);
  requireString(route, "route_id", path);
  requireString(route, "service_id", path);
  requireString(route, "model_id", path);
  requireEnum(route, "status", path, ["stable", "canary", "rollback", "hold"]);
  for (const key of [
    "canary_pct",
    "calls_today",
    "cost_today",
    "error_rate_today",
    "cost_baseline",
    "error_rate_baseline",
  ]) {
    requireNumber(route, key, path);
  }
  if (!Array.isArray(route.daily) || route.daily.length === 0) fail(`${path}.daily must be a non-empty array`);
  if (routeIds.has(route.route_id)) fail(`${path}.route_id duplicates ${route.route_id}`);
  routeIds.add(route.route_id);
  if (!serviceIds.has(route.service_id)) fail(`${path}.service_id does not match a service: ${route.service_id}`);
  if (!modelIds.has(route.model_id)) fail(`${path}.model_id does not match a model: ${route.model_id}`);
});

snapshot.anomalies.forEach((anomaly: JsonObject, index: number) => {
  const path = `root.anomalies[${index}]`;
  if (!isObject(anomaly)) fail(`${path} must be an object`);
  requireString(anomaly, "id", path);
  requireString(anomaly, "route_id", path);
  requireEnum(anomaly, "kind", path, ["cost_spike", "error_spike"]);
  requireEnum(anomaly, "status", path, ["open", "acknowledged"]);
  if (!routeIds.has(anomaly.route_id)) fail(`${path}.route_id does not match a route: ${anomaly.route_id}`);
});

// Consistency: totals.cost_today should equal the sum of route cost_today.
const sumCost = snapshot.routes.reduce((sum: number, r: JsonObject) => sum + Number(r.cost_today || 0), 0);
if (Math.abs(sumCost - snapshot.totals.cost_today) > 0.5) {
  fail(`totals.cost_today (${snapshot.totals.cost_today}) != sum of routes (${sumCost.toFixed(2)})`);
}

console.log(`OK: ${target}`);
