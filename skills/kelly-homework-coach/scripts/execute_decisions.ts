#!/usr/bin/env node
import { isoNow, readJson, writeJson } from "../lib/common.ts";
import { AGENT_TASKS_PATH, DECISIONS_PATH, EXECUTION_REPORT_PATH, SNAPSHOT_PATH } from "../lib/paths.ts";
import type { AgentTasksFile, DecisionsFile, ExecutionReport, HomeworkSnapshot, ReviewItem } from "../lib/types.ts";

const apply = process.argv.includes("--apply");

function operationFor(item: ReviewItem): string {
  if (item.proposed_action === "add_to_mistake_book") return "add_to_mistake_book";
  if (item.proposed_action === "export_paper_plan") return "export_paper_plan";
  if (item.proposed_action === "generate_practice") return "queue_practice_paper";
  if (item.proposed_action === "mark_understood") return "mark_understood";
  if (item.proposed_action === "revise_explanation") return "request_revision";
  return "no_action";
}

const snapshot = await readJson<HomeworkSnapshot>(SNAPSHOT_PATH, null);
if (!snapshot) {
  console.error(`No snapshot found at ${SNAPSHOT_PATH}`);
  process.exit(1);
}

const decisions = (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
const tasks = (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
const now = isoNow();
const results: Record<string, unknown>[] = [];

for (const item of snapshot.review_items) {
  const decision = decisions.decisions[item.review_id];
  if (!decision) continue;

  if (decision.action === "approve") {
    const operation = operationFor(item);
    results.push({
      review_id: item.review_id,
      ref: item.ref,
      target_id: item.target_id,
      operation,
      target: `${item.target_type}:${item.target_id}`,
      status: apply ? "executed" : "planned",
      dry_run: !apply,
      executed_at: apply ? now : undefined,
    });
    if (apply) item.status = "done";
  }

  if (decision.action === "request_changes") {
    const existing = tasks.tasks.find((task) => task.review_id === item.review_id && task.status === "queued");
    results.push({
      review_id: item.review_id,
      ref: item.ref,
      target_id: item.target_id,
      operation: "request_revision",
      status: existing ? "queued" : "blocked",
      dry_run: !apply,
      reason: existing ? "Agent task is queued." : "No agent task found; re-submit request_changes from the app.",
    });
  }

  if (decision.action === "block") {
    results.push({
      review_id: item.review_id,
      ref: item.ref,
      target_id: item.target_id,
      operation: "block_item",
      status: apply ? "executed" : "planned",
      dry_run: !apply,
      reason: decision.comment || "Reviewer blocked the item.",
    });
    if (apply) item.status = "blocked";
  }
}

const report: ExecutionReport = {
  executed_at: now,
  dry_run: !apply,
  source: "kelly-homework-coach",
  results,
};

if (apply) {
  await writeJson(SNAPSHOT_PATH, snapshot);
  await writeJson(EXECUTION_REPORT_PATH, report);
} else {
  console.log(JSON.stringify(report, null, 2));
}

if (apply) console.log(`Wrote execution report: ${EXECUTION_REPORT_PATH}`);
