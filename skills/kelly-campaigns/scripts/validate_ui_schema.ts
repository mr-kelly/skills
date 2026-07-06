#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = process.argv[2] || path.join(skillDir, "app", ".data", "campaigns_snapshot.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);
const TYPES = new Set(["campaign", "newsletter", "sequence_step", "cold_outbound"]);
const PHASES = new Set(["setup", "engage", "nurture", "deliver"]);
const PROPOSED = new Set(["schedule_send", "ab_test", "hold", "no_action"]);
const VERDICTS = new Set(["ship", "fix", "block"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, ctx: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${ctx}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, ctx: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${ctx}.${key} must be a number`);
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
if (!isObject(snapshot.list_health)) fail("root.list_health must be an object");
for (const key of [
  "subscriber_count",
  "bounce_rate",
  "complaint_rate",
  "churn_rate",
  "avg_open_rate",
  "avg_click_rate",
]) {
  requireNumber(snapshot.list_health, key, "root.list_health");
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of ["needs_review", "approved", "done", "blocked"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["segments", "sends", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const segmentIds = new Set();
snapshot.segments.forEach((segment, index) => {
  const ctx = `root.segments[${index}]`;
  if (!isObject(segment)) fail(`${ctx} must be an object`);
  for (const key of ["segment_id", "name"]) requireString(segment, key, ctx);
  requireNumber(segment, "audience_size", ctx);
  if (segmentIds.has(segment.segment_id)) fail(`${ctx}.segment_id duplicates ${segment.segment_id}`);
  segmentIds.add(segment.segment_id);
});

const sendIds = new Set();
const sendRefs = new Set();
snapshot.sends.forEach((send, index) => {
  const ctx = `root.sends[${index}]`;
  if (!isObject(send)) fail(`${ctx} must be an object`);
  for (const key of [
    "send_id",
    "type",
    "phase",
    "subject",
    "segment_id",
    "status",
    "proposed_action",
    "reason",
    "body",
  ])
    requireString(send, key, ctx);
  requireNumber(send, "ref", ctx);
  requireNumber(send, "audience_size", ctx);
  if (!Array.isArray(send.risk)) fail(`${ctx}.risk must be an array`);
  if (!TYPES.has(send.type)) fail(`${ctx}.type is not valid: ${send.type}`);
  if (!PHASES.has(send.phase)) fail(`${ctx}.phase is not a SEND phase: ${send.phase}`);
  if (!STATUSES.has(send.status)) fail(`${ctx}.status is not a workflow state: ${send.status}`);
  if (!PROPOSED.has(send.proposed_action)) fail(`${ctx}.proposed_action is not valid: ${send.proposed_action}`);
  if (sendIds.has(send.send_id)) fail(`${ctx}.send_id duplicates ${send.send_id}`);
  sendIds.add(send.send_id);
  if (sendRefs.has(send.ref)) fail(`${ctx}.ref duplicates #${send.ref}`);
  sendRefs.add(send.ref);
  if (send.segment_id && !segmentIds.has(send.segment_id))
    fail(`${ctx}.segment_id does not match a segment: ${send.segment_id}`);
  if (!isObject(send.deliverability)) fail(`${ctx}.deliverability must be an object`);
  requireNumber(send.deliverability, "spam_score", `${ctx}.deliverability`);
  requireNumber(send.deliverability, "inbox_readiness", `${ctx}.deliverability`);
  if (!Array.isArray(send.subject_variants)) fail(`${ctx}.subject_variants must be an array`);
  if (send.quality_gate !== null && send.quality_gate !== undefined) {
    if (!isObject(send.quality_gate)) fail(`${ctx}.quality_gate must be an object or null`);
    requireNumber(send.quality_gate, "eqs", `${ctx}.quality_gate`);
    requireString(send.quality_gate, "verdict", `${ctx}.quality_gate`);
    if (!VERDICTS.has(send.quality_gate.verdict))
      fail(`${ctx}.quality_gate.verdict must be ship|fix|block: ${send.quality_gate.verdict}`);
  }
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
  for (const [sendId, decision] of Object.entries(decisionMap as Record<string, Record<string, unknown>>)) {
    const ctx = `decisions.decisions[${sendId}]`;
    if (!isObject(decision)) fail(`${ctx} must be an object`);
    requireString(decision, "action", ctx);
    const action = String(decision.action);
    if (!ACTIONS.has(action)) fail(`${ctx}.action is not a verdict: ${action}`);
    requireString(decision, "decided_at", ctx);
    if (!sendIds.has(sendId)) {
      console.warn(`Warning: ${ctx} does not match a send in the snapshot`);
    }
  }
  console.log(`OK: ${decisionsPath}`);
}
