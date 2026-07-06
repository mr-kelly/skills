#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved launch items, re-checks the
// agent lock and decisions, and records concrete operations in
// execution_report.json. It performs NO external side effects: real submissions,
// pitches, and sends are delegated to other skills (for example kelly-email or
// product-launch-video) per SKILL.md.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "launch_snapshot.json");
const decisionsPath = path.join(dataDir, "decisions.json");
const lockPath = path.join(dataDir, "agent.lock");
const reportPath = path.join(dataDir, "execution_report.json");

const apply = process.argv.includes("--apply");

interface Lock {
  owner?: string;
  message?: string;
}

interface Decision {
  action?: string;
  comment?: string;
  draft?: string;
}

interface Item {
  item_id: string;
  ref?: number;
  phase?: string;
  title?: string;
  channel_id?: string;
  proposed_action?: string;
  status?: string;
  reason?: string;
  draft?: string;
  format?: string;
}

interface Snapshot {
  launch?: { target_date?: string };
  items?: Item[];
}

interface ExecutionResultItem {
  item_id: string;
  ref?: number;
  status: string;
  operation: string;
  channel?: string;
  target?: string;
  format?: string;
  list?: string;
  scheduled_for?: string;
  draft?: string;
  comment?: string;
  reason?: string;
  executed_at: string;
}

interface ExecutionReport {
  results?: ExecutionResultItem[];
}

interface DecisionsFile {
  decisions?: Record<string, Decision>;
}

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

const lock = await readJson<Lock>(lockPath);
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await readJson<Snapshot>(snapshotPath);
if (!snapshot) {
  console.error(`No snapshot at ${snapshotPath}. Nothing to execute.`);
  process.exit(1);
}

const decisions = (await readJson<DecisionsFile>(decisionsPath, { decisions: {} }))?.decisions || {};
const previousReport = await readJson<ExecutionReport>(reportPath);
const alreadyDone = new Set(
  (previousReport?.results || [])
    .filter((item) => item.status === "published" || item.status === "submitted" || item.status === "handed_off")
    .map((item) => item.item_id),
);

const now = new Date().toISOString();
const targetDate = snapshot.launch?.target_date || "";
const results: ExecutionResultItem[] = [];

function operationFor(item: Item): string {
  switch (item.proposed_action) {
    case "submit_channel":
      return "submit_channel";
    case "send_pitch":
      return "send_pitch";
    case "publish_asset":
      return "publish_asset";
    default:
      return "no_action";
  }
}

function appliedStatusFor(action: string): string {
  if (action === "submit_channel") return "submitted";
  if (action === "send_pitch") return "handed_off";
  return "published";
}

for (const item of snapshot.items || []) {
  const decision = decisions[item.item_id];
  if (!decision || decision.action !== "approve") continue;
  const operation = operationFor(item);
  if (operation === "no_action") continue;
  if (item.status === "done" || alreadyDone.has(item.item_id)) {
    results.push({
      item_id: item.item_id,
      ref: item.ref,
      status: "skipped",
      operation,
      reason: "Already published/submitted or marked done; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }
  const draft = decision.draft ?? item.draft ?? "";
  const base: ExecutionResultItem = {
    item_id: item.item_id,
    ref: item.ref,
    status: apply ? appliedStatusFor(operation) : "dry_run",
    operation,
    draft,
    comment: decision.comment || "",
    reason: item.reason || "",
    executed_at: now,
  };
  if (operation === "submit_channel") {
    base.channel = item.channel_id || "";
    base.scheduled_for = targetDate;
  } else if (operation === "send_pitch") {
    base.channel = item.channel_id || "press";
    base.list = "press_tier1";
  } else if (operation === "publish_asset") {
    base.format = item.format || "markdown";
    base.target = `.data/exports/${item.item_id}.${item.format === "markdown" || !item.format ? "md" : "txt"}`;
  }
  results.push(base);
}

if (!results.length) {
  console.log("No approved launch items to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `#${result.ref} ${result.item_id}: ${result.status} ${result.operation}${result.channel ? ` [${result.channel}]` : ""}${result.target ? ` -> ${result.target}` : ""}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve completed history so repeated --apply runs stay idempotent.
const freshlyDone = new Set(results.filter((item) => item.status !== "skipped").map((item) => item.item_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => ["published", "submitted", "handed_off"].includes(item.status) && !freshlyDone.has(item.item_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.item_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-launch",
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.item_id))),
  ],
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}. Real submissions/sends must be performed by the delegated skill per SKILL.md.`);
