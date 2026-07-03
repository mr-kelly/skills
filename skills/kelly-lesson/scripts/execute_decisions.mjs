#!/usr/bin/env node
// Dry-run-by-default executor stub. Re-checks the agent lock, re-reads
// decisions immediately before acting, and records concrete operations in
// execution_report.json. It performs NO external side effects:
// - approve      -> "publish_plan" (target: export path for export_plans.mjs)
//                   plus "send_feedback" when a drafted note exists (real
//                   sending is delegated to other skills per SKILL.md)
// - request_changes -> "request_revision" (ensures an agent_tasks entry)
//
// Usage: node scripts/execute_decisions.mjs [--apply]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "lesson_snapshot.json");
const decisionsPath = path.join(dataDir, "decisions.json");
const agentTasksPath = path.join(dataDir, "agent_tasks.json");
const lockPath = path.join(dataDir, "agent.lock");
const reportPath = path.join(dataDir, "execution_report.json");

const apply = process.argv.includes("--apply");

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "plan";
}

const lock = await readJson(lockPath);
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await readJson(snapshotPath);
if (!snapshot) {
  console.error(`No snapshot at ${snapshotPath}. Nothing to execute.`);
  process.exit(1);
}

const decisions = (await readJson(decisionsPath, { decisions: {} })).decisions || {};
const previousReport = await readJson(reportPath);
const alreadyExecuted = new Set(
  (previousReport?.results || [])
    .filter((item) => item.status === "executed")
    .map((item) => `${item.review_id}:${item.operation}`)
);

const plansById = new Map((snapshot.plans || []).map((plan) => [plan.plan_id, plan]));
const teachersById = new Map((snapshot.teachers || []).map((teacher) => [teacher.teacher_id, teacher]));
const now = new Date().toISOString();
const results = [];
const revisionTasks = [];

function pushResult(item, plan, operation, target, extra = {}) {
  const key = `${item.review_id}:${operation}`;
  if (alreadyExecuted.has(key)) {
    results.push({
      review_id: item.review_id,
      plan_id: item.plan_id,
      ref: item.ref,
      status: "skipped",
      operation,
      target,
      reason: "Already executed; skipping to stay idempotent.",
      executed_at: now
    });
    return;
  }
  results.push({
    review_id: item.review_id,
    plan_id: item.plan_id,
    ref: item.ref,
    status: apply ? "executed" : "dry_run",
    operation,
    target,
    ...extra,
    executed_at: now
  });
}

for (const item of snapshot.review_items || []) {
  const decision = decisions[item.review_id];
  if (!decision) continue;
  const plan = plansById.get(item.plan_id);
  if (!plan) continue;
  const teacher = teachersById.get(plan.teacher_id);
  if (decision.action === "approve") {
    const exportTarget = path.join("exports", `${slugify(`${plan.grade}-${plan.subject}-${plan.title}`)}.md`);
    pushResult(item, plan, "publish_plan", exportTarget, {
      detail: "Run scripts/export_plans.mjs to write the Markdown document."
    });
    const feedback = decision.draft ?? item.feedback_draft ?? "";
    if (feedback.trim()) {
      pushResult(item, plan, "send_feedback", teacher?.name || plan.teacher_id, {
        draft: feedback,
        comment: decision.comment || "",
        detail: "Handoff only: the drafted note is sent by the agent via other channels after approval."
      });
    }
  } else if (decision.action === "request_changes") {
    pushResult(item, plan, "request_revision", plan.plan_id, {
      comment: decision.comment || "",
      detail: "Queued in agent_tasks.json for the agent to redraft."
    });
    revisionTasks.push({
      task_id: `task-${item.review_id}-${Date.parse(now)}`,
      type: "revise_plan",
      review_id: item.review_id,
      plan_id: item.plan_id,
      ref: item.ref,
      comment: decision.comment || "",
      draft: decision.draft,
      requested_at: decision.decided_at || now,
      status: "queued"
    });
  }
}

if (!results.length) {
  console.log("No approved or changes-requested decisions to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(`Plan #${result.ref} ${result.review_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`);
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve executed history so repeated --apply runs stay idempotent.
const freshlyExecuted = new Set(results.filter((item) => item.status === "executed").map((item) => `${item.review_id}:${item.operation}`));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "executed" && !freshlyExecuted.has(`${item.review_id}:${item.operation}`)
);
const carriedKeys = new Set(carriedForward.map((item) => `${item.review_id}:${item.operation}`));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-lesson",
  results: [...carriedForward, ...results.filter((item) => !(item.status === "skipped" && carriedKeys.has(`${item.review_id}:${item.operation}`)))]
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (revisionTasks.length) {
  const tasks = (await readJson(agentTasksPath, { updated_at: "", tasks: [] }));
  for (const task of revisionTasks) {
    tasks.tasks = (tasks.tasks || []).filter((entry) => entry.review_id !== task.review_id);
    tasks.tasks.push(task);
  }
  tasks.updated_at = now;
  await fs.writeFile(agentTasksPath, `${JSON.stringify(tasks, null, 2)}\n`);
  console.log(`Queued ${revisionTasks.length} revision task(s) in ${agentTasksPath}.`);
}
console.log(`Wrote ${reportPath}. Publishing and feedback sending are delegated per SKILL.md.`);
