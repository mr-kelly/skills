#!/usr/bin/env node
import { pathExists, readJson } from "../lib/common.ts";
import { CURRENT_BATCH_PATH, DECISIONS_PATH } from "../lib/paths.ts";

const STATUSES = new Set(["needs_review", "to_approve", "approved", "done", "blocked", "merged"]);
const ACTIONS = new Set(["approve", "comment", "request_changes", "no_action", "needs_review", "block"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateItem(item, index) {
  const prefix = `items[${index}]`;
  assert(item.id, `${prefix}.id is required`);
  assert(item.repo, `${prefix}.repo is required`);
  assert(Number.isInteger(Number(item.number)) && Number(item.number) > 0, `${prefix}.number must be positive`);
  assert(item.title, `${prefix}.title is required`);
  assert(STATUSES.has(item.status), `${prefix}.status is invalid: ${item.status}`);
  assert(ACTIONS.has(item.proposed_action), `${prefix}.proposed_action is invalid: ${item.proposed_action}`);
  if (item.verification_status)
    assert(["needs_test", "tested"].includes(item.verification_status), `${prefix}.verification_status is invalid`);
  assert(Array.isArray(item.risk), `${prefix}.risk must be an array`);
  assert(Array.isArray(item.changed_files), `${prefix}.changed_files must be an array`);
  if (item.decision?.action) assert(ACTIONS.has(item.decision.action), `${prefix}.decision.action is invalid`);
}

async function main() {
  if (!(await pathExists(CURRENT_BATCH_PATH))) {
    console.log(`No batch file found: ${CURRENT_BATCH_PATH}`);
    return;
  }
  const batch = await readJson(CURRENT_BATCH_PATH);
  assert(batch.batch_id, "batch_id is required");
  assert(Array.isArray(batch.items), "items must be an array");
  batch.items.forEach(validateItem);
  if (await pathExists(DECISIONS_PATH)) {
    const decisions = await readJson(DECISIONS_PATH);
    assert(Array.isArray(decisions.decisions), "decisions.decisions must be an array");
  }
  console.log(`Schema OK: ${batch.items.length} item(s)`);
}

await main();
