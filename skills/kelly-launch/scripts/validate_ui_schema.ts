#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "launch_snapshot.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");

const PHASES = new Set(["research", "assemble", "mobilize", "prove"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const READINESS = new Set(["SHIP", "FIX", "BLOCK"]);
const PROPOSED_ACTIONS = new Set(["publish_asset", "submit_channel", "send_pitch", "no_action"]);
const ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

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
if (!Array.isArray(snapshot.phases) || !snapshot.phases.length) fail("root.phases must be a non-empty array");
if (!isObject(snapshot.product)) fail("root.product must be an object");
if (!isObject(snapshot.launch)) fail("root.launch must be an object");
if (!isObject(snapshot.readiness)) fail("root.readiness must be an object");
if (!READINESS.has(snapshot.readiness.verdict)) fail("root.readiness.verdict must be SHIP|FIX|BLOCK");
requireNumber(snapshot.readiness, "lqs", "root.readiness");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of ["item_count", "needs_review", "approved", "done", "blocked", "ship", "fix", "block"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["channels", "items", "runbook", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const channelIds = new Set();
snapshot.channels.forEach((channel, index) => {
  const at = `root.channels[${index}]`;
  if (!isObject(channel)) fail(`${at} must be an object`);
  for (const key of ["channel_id", "type", "display_name"]) requireString(channel, key, at);
  channelIds.add(channel.channel_id);
});

const itemIds = new Set();
const itemRefs = new Set();
snapshot.items.forEach((item, index) => {
  const at = `root.items[${index}]`;
  if (!isObject(item)) fail(`${at} must be an object`);
  for (const key of ["item_id", "phase", "title", "readiness", "proposed_action", "status"])
    requireString(item, key, at);
  requireNumber(item, "ref", at);
  if (!Array.isArray(item.risk)) fail(`${at}.risk must be an array`);
  if (!PHASES.has(item.phase)) fail(`${at}.phase is not a RAMP phase: ${item.phase}`);
  if (!STATUSES.has(item.status)) fail(`${at}.status is not a workflow state: ${item.status}`);
  if (!READINESS.has(item.readiness)) fail(`${at}.readiness must be SHIP|FIX|BLOCK: ${item.readiness}`);
  if (!PROPOSED_ACTIONS.has(item.proposed_action))
    fail(`${at}.proposed_action is not supported: ${item.proposed_action}`);
  if (itemIds.has(item.item_id)) fail(`${at}.item_id duplicates ${item.item_id}`);
  itemIds.add(item.item_id);
  if (itemRefs.has(item.ref)) fail(`${at}.ref duplicates #${item.ref}`);
  itemRefs.add(item.ref);
  if (item.channel_id && !channelIds.has(item.channel_id))
    fail(`${at}.channel_id does not match a channel: ${item.channel_id}`);
});

const stepIds = new Set();
snapshot.runbook.forEach((step, index) => {
  const at = `root.runbook[${index}]`;
  if (!isObject(step)) fail(`${at} must be an object`);
  for (const key of ["step_id", "title"]) requireString(step, key, at);
  if (stepIds.has(step.step_id)) fail(`${at}.step_id duplicates ${step.step_id}`);
  stepIds.add(step.step_id);
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
  for (const [itemId, decision] of Object.entries(decisionMap as Record<string, Record<string, unknown>>)) {
    const at = `decisions.decisions[${itemId}]`;
    if (!isObject(decision)) fail(`${at} must be an object`);
    requireString(decision, "action", at);
    const action = String(decision.action);
    if (!ACTIONS.has(action)) fail(`${at}.action is not a verdict: ${action}`);
    requireString(decision, "decided_at", at);
    if (!itemIds.has(itemId)) {
      console.warn(`Warning: ${at} does not match an item in the snapshot`);
    }
  }
  console.log(`OK: ${decisionsPath}`);
}
