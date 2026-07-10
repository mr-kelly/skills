#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/agents.json", import.meta.url).pathname;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: JsonObject, key: string, path: string, allowEmpty = false): void {
  if (typeof obj[key] !== "string" || (!allowEmpty && obj[key].length === 0)) {
    fail(`${path}.${key} must be a ${allowEmpty ? "" : "non-empty "}string`);
  }
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

let file: JsonObject;
try {
  file = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(file)) fail("root must be an object");
requireString(file, "schema_version", "root");
requireString(file, "generated_at", "root");
if (!Array.isArray(file.agents)) fail("root.agents must be an array");

const ids = new Set();
file.agents.forEach((agent: JsonObject, index: number) => {
  const path = `root.agents[${index}]`;
  if (!isObject(agent)) fail(`${path} must be an object`);
  requireString(agent, "id", path);
  requireString(agent, "name", path, true);
  requireString(agent, "trigger_description", path, true);
  if (!Array.isArray(agent.allowed_tools)) fail(`${path}.allowed_tools must be an array`);
  requireBoolean(agent, "approval_required", path);
  requireNumber(agent, "monthly_quota", path);
  requireNumber(agent, "calls_this_month", path);
  requireString(agent, "owning_team", path, true);
  requireEnum(agent, "status", path, ["draft", "live", "paused", "archived"]);
  requireString(agent, "created_at", path);
  requireString(agent, "updated_at", path);
  if (ids.has(agent.id)) fail(`${path}.id duplicates ${agent.id}`);
  ids.add(agent.id);
});

console.log(`OK: ${target} (${file.agents.length} agent configs)`);
