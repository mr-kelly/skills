#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "creator_snapshot.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);
const PROPOSED = new Set(["send_outreach", "send_brief", "draft_contract", "no_action"]);
const ITEM_TYPES = new Set(["engagement", "quality_gate"]);
const GATE_VERDICTS = new Set(["ship", "fix", "block"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${path}.${key} must be a number`);
}

async function readJson(file: string) {
  const raw = await fs.readFile(file, "utf8").catch((error) => {
    fail(`cannot read ${file}: ${error.message}`);
  });
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${error.message}`);
  }
}

const snapshot = await readJson(snapshotPath);

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
requireString(snapshot, "base_currency", "root");
if (!Array.isArray(snapshot.pipeline_stages) || !snapshot.pipeline_stages.length)
  fail("root.pipeline_stages must be a non-empty array");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "creator_count",
  "needs_review",
  "approved",
  "done",
  "blocked",
  "total_reach",
  "budget_total",
  "budget_allocated",
  "est_value",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["creators", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const creatorIds = new Set();
const refs = new Set();
snapshot.creators.forEach((creator, index) => {
  const path = `root.creators[${index}]`;
  if (!isObject(creator)) fail(`${path} must be an object`);
  for (const key of ["creator_id", "handle", "name", "platform", "niche", "stage", "status", "reason"])
    requireString(creator, key, path);
  requireNumber(creator, "ref", path);
  requireNumber(creator, "followers", path);
  requireNumber(creator, "engagement_rate", path);
  requireNumber(creator, "fit_score", path);
  requireNumber(creator, "est_rate", path);
  if (!Array.isArray(creator.risk)) fail(`${path}.risk must be an array`);
  if (!STATUSES.has(creator.status)) fail(`${path}.status is not a workflow state: ${creator.status}`);
  if (!snapshot.pipeline_stages.includes(creator.stage))
    fail(`${path}.stage is not in pipeline_stages: ${creator.stage}`);
  if (!PROPOSED.has(creator.proposed_action)) fail(`${path}.proposed_action is invalid: ${creator.proposed_action}`);
  const itemType = creator.item_type || "engagement";
  if (!ITEM_TYPES.has(itemType)) fail(`${path}.item_type is invalid: ${itemType}`);
  if (itemType === "quality_gate") {
    if (!GATE_VERDICTS.has(creator.gate_verdict)) fail(`${path}.gate_verdict is invalid: ${creator.gate_verdict}`);
    if (!Array.isArray(creator.gate_checks)) fail(`${path}.gate_checks must be an array`);
  }
  if (creatorIds.has(creator.creator_id)) fail(`${path}.creator_id duplicates ${creator.creator_id}`);
  creatorIds.add(creator.creator_id);
  if (refs.has(creator.ref)) fail(`${path}.ref duplicates #${creator.ref}`);
  refs.add(creator.ref);
});

console.log(`OK: ${snapshotPath}`);

const decisionsExists = await fs.access(decisionsPath).then(
  () => true,
  () => false,
);
if (decisionsExists) {
  const decisions = await readJson(decisionsPath);
  if (!isObject(decisions)) fail("decisions root must be an object");
  const decisionMap = (decisions as Record<string, unknown>).decisions;
  if (!isObject(decisionMap)) fail("decisions.decisions must be an object");
  for (const [creatorId, decision] of Object.entries(decisionMap as Record<string, Record<string, unknown>>)) {
    const path = `decisions.decisions[${creatorId}]`;
    if (!isObject(decision)) fail(`${path} must be an object`);
    requireString(decision, "action", path);
    const action = String(decision.action);
    if (!ACTIONS.has(action)) fail(`${path}.action is not a verdict: ${action}`);
    requireString(decision, "decided_at", path);
    if (!creatorIds.has(creatorId)) {
      console.warn(`Warning: ${path} does not match a creator in the snapshot`);
    }
  }
  console.log(`OK: ${decisionsPath}`);
}
