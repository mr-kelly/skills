#!/usr/bin/env node
import {
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  decisionAction,
  executionStatus,
  isApproved,
  isBlocked,
  isDone,
  isNeedsReview,
  isToApprove,
  readJson
} from "../lib/common.mjs";

const VALID_STATUS = new Set(["prepared", "needs_review", "draft_requested", "drafted", "executed"]);
const VALID_ACTION = new Set(["archive", "mark_read", "send_reply", "draft_reply", "keep_unread", "review"]);
const VALID_DECISION = new Set(["archive", "mark_read", "send_reply", "draft_reply", "keep_unread", "no_action", "needs_review", "revise"]);
const VALID_EXECUTION = new Set(["executed", "blocked", "error"]);

async function main() {
  const batch = await readJson(CURRENT_BATCH_PATH, {});
  const decisionsPayload = await readJson(DECISIONS_PATH, {});
  const errors = [];
  const items = batch.items || [];

  if (!batch.batch_id) errors.push("current_batch.json missing batch_id");
  if (decisionsPayload.batch_id && decisionsPayload.batch_id !== batch.batch_id) {
    errors.push("decisions.json batch_id does not match current_batch.json");
  }

  const itemIds = new Set();
  for (const [index, item] of items.entries()) {
    const label = `item[${index}] uid=${item.uid}`;
    const itemId = String(item.id || "");
    if (!itemId) errors.push(`${label}: missing id`);
    else if (itemIds.has(itemId)) errors.push(`${label}: duplicate id ${itemId}`);
    itemIds.add(itemId);

    for (const key of ["uid", "account", "from", "to", "subject", "status", "proposed_action"]) {
      if (!(key in item)) errors.push(`${label}: missing ${key}`);
    }
    if (!VALID_STATUS.has(item.status)) errors.push(`${label}: invalid status ${JSON.stringify(item.status)}`);
    if (!VALID_ACTION.has(item.proposed_action)) errors.push(`${label}: invalid proposed_action ${JSON.stringify(item.proposed_action)}`);
    if (item.status === "decided") errors.push(`${label}: status=decided is not part of UI schema`);

    const decision = item.decision || {};
    if (Object.keys(decision).length && !VALID_DECISION.has(decision.action)) {
      errors.push(`${label}: invalid decision.action ${JSON.stringify(decision.action)}`);
    }
    const execution = item.execution || {};
    if (Object.keys(execution).length && !VALID_EXECUTION.has(execution.status)) {
      errors.push(`${label}: invalid execution.status ${JSON.stringify(execution.status)}`);
    }
  }

  const expectedDecisions = items.filter((item) => decisionAction(item));
  const actualDecisions = decisionsPayload.decisions || [];
  if (expectedDecisions.length !== actualDecisions.length) {
    errors.push(`decisions.json has ${actualDecisions.length} decisions, expected ${expectedDecisions.length} from batch items`);
  }

  const counts = {
    needs_review: items.filter(isNeedsReview).length,
    to_approve: items.filter(isToApprove).length,
    approved: items.filter(isApproved).length,
    done: items.filter(isDone).length,
    blocked: items.filter(isBlocked).length
  };

  console.log(JSON.stringify({
    batch_id: batch.batch_id,
    items: items.length,
    counts,
    execution_statuses: items.reduce((acc, item) => {
      const status = executionStatus(item);
      if (status) acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    errors
  }, null, 2));
  return errors.length ? 1 : 0;
}

process.exitCode = await main();
