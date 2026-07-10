#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/current_batch.json", import.meta.url).pathname;

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

function requireEnum(obj: JsonObject, key: string, path: string, allowed: string[]): void {
  if (!allowed.includes(obj[key])) fail(`${path}.${key} must be one of ${allowed.join("|")}, got ${obj[key]}`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let batch: JsonObject;
try {
  batch = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(batch)) fail("root must be an object");
requireString(batch, "batch_id", "root");
requireString(batch, "generated_at", "root");
if (!Array.isArray(batch.vehicles)) fail("root.vehicles must be an array");
if (!Array.isArray(batch.items)) fail("root.items must be an array");

const vehicleIds = new Set<string>();
batch.vehicles.forEach((vehicle: JsonObject, index: number) => {
  const path = `root.vehicles[${index}]`;
  if (!isObject(vehicle)) fail(`${path} must be an object`);
  requireString(vehicle, "vehicle_id", path);
  requireString(vehicle, "name", path);
  requireEnum(vehicle, "vehicle_type", path, ["fund", "spv"]);
  requireEnum(vehicle, "readiness", path, ["ready", "blocked", "in_progress"]);
  if (vehicleIds.has(vehicle.vehicle_id)) fail(`${path}.vehicle_id duplicates ${vehicle.vehicle_id}`);
  vehicleIds.add(vehicle.vehicle_id);
});

const itemIds = new Set<string>();
batch.items.forEach((item: JsonObject, index: number) => {
  const path = `root.items[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  requireString(item, "id", path);
  requireString(item, "vehicle_id", path);
  requireEnum(item, "role", path, ["origination", "fund_manager", "listing_venue"]);
  requireEnum(item, "status", path, ["needs_review", "changes_requested", "done", "blocked"]);
  requireString(item, "title", path);
  if (itemIds.has(item.id)) fail(`${path}.id duplicates ${item.id}`);
  itemIds.add(item.id);
  if (!vehicleIds.has(item.vehicle_id)) fail(`${path}.vehicle_id does not match a vehicle: ${item.vehicle_id}`);
  if (item.decision) {
    requireEnum(item.decision, "action", `${path}.decision`, ["verified", "needs_source", "flagged"]);
    requireString(item.decision, "decided_at", `${path}.decision`);
  }
  if (item.reconciliation) {
    if (typeof item.reconciliation.match !== "boolean") fail(`${path}.reconciliation.match must be a boolean`);
  }
});

console.log(`OK: ${target} (${batch.vehicles.length} vehicles, ${batch.items.length} items)`);
