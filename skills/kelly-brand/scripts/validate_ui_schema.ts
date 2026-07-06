#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "brand_snapshot.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const TYPES = new Set(["positioning", "message_pillar", "story", "proof_point", "vocabulary", "guardrail"]);
const PHASES = new Set(["trace", "architect", "land", "evaluate"]);
const GATES = new Set(["SHIP", "FIX", "BLOCK"]);
const DRIFT_STATUSES = new Set(["open", "resolved", "dismissed"]);
const ACTIONS = new Set(["approve", "request_changes", "block", "revise", "resolve_drift", "dismiss_drift"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): boolean {
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
requireString(snapshot, "framework", "root");
if (!isObject(snapshot.positioning)) fail("root.positioning must be an object");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "item_count",
  "canonical_count",
  "needs_review_count",
  "pillar_count",
  "story_count",
  "proof_point_count",
  "overall_nqs",
  "drift_open_count",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["items", "drift_alerts", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const itemIds = new Set<string>();
const itemRefs = new Set<number>();
snapshot.items.forEach((item, index) => {
  const at = `root.items[${index}]`;
  if (!isObject(item)) fail(`${at} must be an object`);
  for (const key of ["item_id", "type", "title", "draft", "status"]) requireString(item, key, at);
  requireNumber(item, "ref", at);
  if (!TYPES.has(item.type)) fail(`${at}.type is not a narrative type: ${item.type}`);
  if (!STATUSES.has(item.status)) fail(`${at}.status is not a workflow state: ${item.status}`);
  if (item.phase && !PHASES.has(item.phase)) fail(`${at}.phase is not a TALE phase: ${item.phase}`);
  if (!Array.isArray(item.risk)) fail(`${at}.risk must be an array`);
  if (item.nqs !== null && item.nqs !== undefined) {
    if (!isObject(item.nqs)) fail(`${at}.nqs must be an object or null`);
    requireNumber(item.nqs, "score", `${at}.nqs`);
    if (item.nqs.score < 0 || item.nqs.score > 100) fail(`${at}.nqs.score must be 0-100`);
    if (!GATES.has(item.nqs.gate)) fail(`${at}.nqs.gate must be SHIP|FIX|BLOCK`);
  }
  if (item.type === "proof_point" && item.evidence !== null && item.evidence !== undefined) {
    if (!isObject(item.evidence)) fail(`${at}.evidence must be an object or null`);
    requireString(item.evidence, "source", `${at}.evidence`);
  }
  if (itemIds.has(item.item_id)) fail(`${at}.item_id duplicates ${item.item_id}`);
  itemIds.add(item.item_id);
  if (itemRefs.has(item.ref)) fail(`${at}.ref duplicates #${item.ref}`);
  itemRefs.add(item.ref);
});

snapshot.drift_alerts.forEach((alert, index) => {
  const at = `root.drift_alerts[${index}]`;
  if (!isObject(alert)) fail(`${at} must be an object`);
  for (const key of ["alert_id", "channel_id", "title", "offending_usage", "canonical_guidance", "status"])
    requireString(alert, key, at);
  if (!DRIFT_STATUSES.has(alert.status)) fail(`${at}.status must be open|resolved|dismissed`);
  if (alert.guardrail_item_id && !itemIds.has(alert.guardrail_item_id))
    fail(`${at}.guardrail_item_id does not match an item: ${alert.guardrail_item_id}`);
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
  const alertIds = new Set(snapshot.drift_alerts.map((alert) => alert.alert_id));
  for (const [targetId, decision] of Object.entries(decisionMap as Record<string, Record<string, unknown>>)) {
    const at = `decisions.decisions[${targetId}]`;
    if (!isObject(decision)) fail(`${at} must be an object`);
    requireString(decision, "action", at);
    const action = String(decision.action);
    if (!ACTIONS.has(action)) fail(`${at}.action is not a verdict: ${action}`);
    requireString(decision, "decided_at", at);
    if (!itemIds.has(targetId) && !alertIds.has(targetId)) {
      console.warn(`Warning: ${at} does not match an item or drift alert in the snapshot`);
    }
  }
  console.log(`OK: ${decisionsPath}`);
}
