#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const batchPath = process.argv[2] || path.join(skillDir, "app", ".data", "current_batch.json");
const decisionsPath = process.argv[3] || path.join(skillDir, "app", ".data", "decisions.json");
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reqString(obj: Record<string, unknown>, key: string, where: string) {
  if (typeof obj[key] !== "string" || String(obj[key]).length === 0) fail(`${where}.${key} must be a non-empty string`);
}

function reqNumber(obj: Record<string, unknown>, key: string, where: string) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${where}.${key} must be a number`);
}

async function readJson(file: string) {
  const raw = await fs.readFile(file, "utf8").catch((error) => fail(`cannot read ${file}: ${error.message}`));
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${(error as Error).message}`);
  }
}

const batch = await readJson(batchPath);
if (!isObject(batch)) fail("root must be an object");
for (const key of ["schema_version", "batch_id", "generated_at", "source", "vertical", "buyer", "offer"])
  reqString(batch, key, "root");
if (!isObject(batch.metrics)) fail("root.metrics must be an object");
for (const key of ["signals_needs_review", "actions_needs_review", "drafts_needs_review", "approved", "blocked"])
  reqNumber(batch.metrics, key, "root.metrics");
for (const key of ["signals", "actions", "drafts", "sources"]) {
  if (!Array.isArray(batch[key])) fail(`root.${key} must be an array`);
}

const ids = new Set<string>();
function checkBase(item: unknown, where: string) {
  if (!isObject(item)) fail(`${where} must be an object`);
  reqString(item, "id", where);
  reqNumber(item, "ref", where);
  reqString(item, "title", where);
  reqString(item, "status", where);
  if (!STATUSES.has(String(item.status))) fail(`${where}.status is invalid: ${item.status}`);
  if (ids.has(String(item.id))) fail(`${where}.id duplicates ${item.id}`);
  ids.add(String(item.id));
  if (!Array.isArray(item.risk) && where.includes("draft")) fail(`${where}.risk must be an array`);
  return item;
}

(batch.signals as unknown[]).forEach((item, index) => {
  const signal = checkBase(item, `root.signals[${index}]`);
  for (const key of ["summary", "why_it_matters", "buyer_intent", "detected_at"])
    reqString(signal, key, `root.signals[${index}]`);
  reqNumber(signal, "confidence", `root.signals[${index}]`);
  if (!isObject(signal.source)) fail(`root.signals[${index}].source must be an object`);
  reqString(signal.source, "name", `root.signals[${index}].source`);
  reqString(signal.source, "url", `root.signals[${index}].source`);
});

(batch.actions as unknown[]).forEach((item, index) => {
  const action = checkBase(item, `root.actions[${index}]`);
  for (const key of ["summary", "priority", "owner", "reason", "next_step"])
    reqString(action, key, `root.actions[${index}]`);
  if (!Array.isArray(action.linked_signal_ids)) fail(`root.actions[${index}].linked_signal_ids must be an array`);
});

(batch.drafts as unknown[]).forEach((item, index) => {
  const draft = checkBase(item, `root.drafts[${index}]`);
  for (const key of ["channel", "body", "linked_action_id"]) reqString(draft, key, `root.drafts[${index}]`);
});

(batch.sources as unknown[]).forEach((item, index) => {
  if (!isObject(item)) fail(`root.sources[${index}] must be an object`);
  for (const key of ["id", "label", "status"]) reqString(item, key, `root.sources[${index}]`);
});

console.log(`OK: ${batchPath}`);

const decisionsExists = await fs.access(decisionsPath).then(
  () => true,
  () => false,
);
if (decisionsExists) {
  const decisions = await readJson(decisionsPath);
  if (!isObject(decisions) || !isObject(decisions.decisions)) fail("decisions.decisions must be an object");
  for (const [id, decision] of Object.entries(decisions.decisions)) {
    if (!isObject(decision)) fail(`decisions[${id}] must be an object`);
    reqString(decision, "action", `decisions[${id}]`);
    if (!ACTIONS.has(String(decision.action))) fail(`decisions[${id}].action invalid: ${decision.action}`);
    if (!ids.has(id)) console.warn(`Warning: decision for unknown item id ${id}`);
  }
  console.log(`OK: ${decisionsPath}`);
}
