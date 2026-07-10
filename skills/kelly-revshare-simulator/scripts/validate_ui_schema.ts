#!/usr/bin/env node
import fs from "node:fs/promises";
import { SCENARIOS_PATH } from "../lib/paths.ts";

const target = process.argv[2] || SCENARIOS_PATH;

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
requireString(batch, "source", "root");
if (batch.mode !== "app-in-skill") fail(`root.mode must be "app-in-skill"`);
if (!Array.isArray(batch.scenarios)) fail("root.scenarios must be an array");

if (!isObject(batch.metrics)) fail("root.metrics must be an object");
for (const key of ["total", "approved", "needs_revision", "rejected", "undecided"]) {
  requireNumber(batch.metrics, key, "root.metrics");
}

const ids = new Set();
const inputFields = [
  "business_type",
  "avg_monthly_revenue",
  "revenue_volatility_pct",
  "principal",
  "initial_share_rate_pct",
  "step_down_share_rate_pct",
  "repayment_cap_multiple",
  "term_months",
];
const numericInputFields = inputFields.filter((f) => f !== "business_type");

batch.scenarios.forEach((scenario: JsonObject, index: number) => {
  const path = `root.scenarios[${index}]`;
  if (!isObject(scenario)) fail(`${path} must be an object`);
  requireString(scenario, "id", path);
  requireString(scenario, "name", path);
  requireString(scenario, "created_at", path);
  requireString(scenario, "updated_at", path);
  if (ids.has(scenario.id)) fail(`${path}.id duplicates ${scenario.id}`);
  ids.add(scenario.id);

  if (!isObject(scenario.input)) fail(`${path}.input must be an object`);
  requireString(scenario.input, "business_type", `${path}.input`);
  for (const key of numericInputFields) requireNumber(scenario.input, key, `${path}.input`);

  if (!isObject(scenario.result)) fail(`${path}.result must be an object`);
  if (!Array.isArray(scenario.result.monthly)) fail(`${path}.result.monthly must be an array`);
  requireNumber(scenario.result, "total_repayment", `${path}.result`);
  requireNumber(scenario.result, "cap_amount", `${path}.result`);
  if (!Array.isArray(scenario.result.risk_flags)) fail(`${path}.result.risk_flags must be an array`);

  if (!isObject(scenario.decision)) fail(`${path}.decision must be an object`);
  const validActions = ["approve_underwriting", "needs_revision", "reject", null];
  if (!validActions.includes(scenario.decision.action)) {
    fail(`${path}.decision.action must be one of ${validActions.join("|")}`);
  }

  // Consistency: cap_amount should equal principal * repayment_cap_multiple.
  const expectedCap = Number(scenario.input.principal) * Number(scenario.input.repayment_cap_multiple);
  if (Math.abs(expectedCap - Number(scenario.result.cap_amount)) > 0.5) {
    fail(
      `${path}.result.cap_amount (${scenario.result.cap_amount}) != principal * cap_multiple (${expectedCap.toFixed(2)})`,
    );
  }
});

console.log(`OK: ${target}`);
