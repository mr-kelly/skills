#!/usr/bin/env node
import fs from "node:fs/promises";
import { LEADS_PATH } from "../lib/paths.ts";
import { STAGES } from "../lib/types.ts";

const target = process.argv[2] || LEADS_PATH;

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

function requireBoolean(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "boolean") fail(`${path}.${key} must be a boolean`);
}

function requireEnum(obj: JsonObject, key: string, path: string, allowed: string[]): void {
  if (!allowed.includes(obj[key])) fail(`${path}.${key} must be one of ${allowed.join("|")}, got ${obj[key]}`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let leads: JsonObject[];
try {
  leads = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!Array.isArray(leads)) fail("root must be an array of leads");

const CATEGORIES = ["food_beverage", "retail_discretionary", "services", "healthcare", "ecommerce", "other"];
const SOURCES = ["referral", "inbound_web", "outbound_sourcing", "event", "partner"];

const ids = new Set<string>();
leads.forEach((lead, index) => {
  const path = `root[${index}]`;
  if (!isObject(lead)) fail(`${path} must be an object`);
  requireString(lead, "id", path);
  requireString(lead, "brand_name", path);
  requireEnum(lead, "category", path, CATEGORIES);
  requireString(lead, "city", path);
  requireNumber(lead, "store_count", path);
  requireNumber(lead, "est_monthly_revenue", path);
  requireEnum(lead, "lead_source", path, SOURCES);
  requireBoolean(lead, "data_verifiable", path);
  requireEnum(lead, "stage", path, STAGES);
  requireNumber(lead, "score", path);
  if (lead.score < 0 || lead.score > 100) fail(`${path}.score must be between 0 and 100`);
  if (!Array.isArray(lead.score_breakdown) || lead.score_breakdown.length === 0)
    fail(`${path}.score_breakdown must be a non-empty array`);
  requireString(lead, "suggested_action", path);
  if (!Array.isArray(lead.notes)) fail(`${path}.notes must be an array`);
  if (!Array.isArray(lead.stage_history)) fail(`${path}.stage_history must be an array`);
  requireString(lead, "created_at", path);
  requireString(lead, "updated_at", path);
  if (lead.stage === "rejected" && !lead.rejection_reason) fail(`${path} is rejected but has no rejection_reason`);
  if (ids.has(lead.id)) fail(`${path}.id duplicates ${lead.id}`);
  ids.add(lead.id);

  const weightSum = lead.score_breakdown.reduce(
    (sum: number, factor: JsonObject) => sum + Number(factor.weight || 0),
    0,
  );
  if (Math.abs(weightSum - 100) > 0.01) fail(`${path}.score_breakdown weights sum to ${weightSum}, expected 100`);
});

if (leads.length < 15 || leads.length > 25) {
  console.warn(`Warning: expected 15-25 leads for a demo pipeline, found ${leads.length}`);
}

console.log(`OK: ${target} (${leads.length} leads)`);
