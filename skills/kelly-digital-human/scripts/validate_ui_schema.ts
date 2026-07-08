#!/usr/bin/env node
import fs from "node:fs/promises";
import { demoState } from "../app/server/demo.ts";
import { readJson } from "../lib/common.ts";
import { snapshotPath } from "../lib/paths.ts";

const snapshotArg = process.argv[2] || "";
const PATHS = new Set(["2d_fast", "3d_custom", "hybrid"]);
const VERDICTS = new Set(["SHIP", "FIX", "BLOCK"]);
const CHECK_STATUSES = new Set(["pass", "fix", "block"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, at: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${at}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, at: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${at}.${key} must be a number`);
}

async function readSnapshot(): Promise<unknown> {
  if (snapshotArg) {
    try {
      return JSON.parse(await fs.readFile(snapshotArg, "utf8"));
    } catch (error) {
      fail(`cannot read ${snapshotArg}: ${(error as Error).message}`);
    }
  }
  return (await readJson(snapshotPath, null)) || demoState(new URLSearchParams("demo=overview")).snapshot;
}

const snapshot = await readSnapshot();
if (!isObject(snapshot)) fail("root must be an object");

for (const key of ["schema_version", "generated_at", "source"]) requireString(snapshot, key, "root");
for (const key of ["project", "metrics"]) {
  if (!isObject(snapshot[key])) fail(`root.${key} must be an object`);
}
for (const key of ["personas", "pipelines", "vendors", "qa_checks", "events"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const project = snapshot.project as Record<string, unknown>;
requireString(project, "name", "root.project");
requireString(project, "target_scene", "root.project");
requireString(project, "recommended_path", "root.project");
requireString(project, "verdict", "root.project");
requireNumber(project, "readiness_score", "root.project");
if (!PATHS.has(String(project.recommended_path)))
  fail("root.project.recommended_path must be 2d_fast|3d_custom|hybrid");
if (!VERDICTS.has(String(project.verdict))) fail("root.project.verdict must be SHIP|FIX|BLOCK");

const metrics = snapshot.metrics as Record<string, unknown>;
for (const key of ["target_latency_ms", "current_latency_ms", "lip_sync_score", "qa_passed", "qa_total"]) {
  requireNumber(metrics, key, "root.metrics");
}

const personas = snapshot.personas as unknown[];
const pipelines = snapshot.pipelines as unknown[];
const vendors = snapshot.vendors as unknown[];
const qaChecks = snapshot.qa_checks as unknown[];
const personaIds = new Set<string>();
personas.forEach((persona, index) => {
  const at = `root.personas[${index}]`;
  if (!isObject(persona)) fail(`${at} must be an object`);
  for (const key of ["id", "name", "path", "language", "voice", "look", "disclosure"]) requireString(persona, key, at);
  if (!PATHS.has(String(persona.path))) fail(`${at}.path must be 2d_fast|3d_custom|hybrid`);
  if (personaIds.has(String(persona.id))) fail(`${at}.id duplicates ${persona.id}`);
  personaIds.add(String(persona.id));
});

pipelines.forEach((pipeline, index) => {
  const at = `root.pipelines[${index}]`;
  if (!isObject(pipeline)) fail(`${at} must be an object`);
  for (const key of ["id", "path", "label", "provider", "input", "output", "status"]) requireString(pipeline, key, at);
  requireNumber(pipeline, "latency_ms", at);
  if (!PATHS.has(String(pipeline.path))) fail(`${at}.path must be 2d_fast|3d_custom|hybrid`);
  if (!Array.isArray(pipeline.stages)) fail(`${at}.stages must be an array`);
});

vendors.forEach((vendor, index) => {
  const at = `root.vendors[${index}]`;
  if (!isObject(vendor)) fail(`${at} must be an object`);
  for (const key of ["id", "label", "path", "integration", "speed", "control", "cost", "risk"])
    requireString(vendor, key, at);
});

const checkIds = new Set<string>();
qaChecks.forEach((check, index) => {
  const at = `root.qa_checks[${index}]`;
  if (!isObject(check)) fail(`${at} must be an object`);
  for (const key of ["id", "label", "status", "owner", "evidence"]) requireString(check, key, at);
  if (!CHECK_STATUSES.has(String(check.status))) fail(`${at}.status must be pass|fix|block`);
  if (checkIds.has(String(check.id))) fail(`${at}.id duplicates ${check.id}`);
  checkIds.add(String(check.id));
});

console.log(`OK: ${snapshotArg || snapshotPath} (${qaChecks.length} QA checks)`);
