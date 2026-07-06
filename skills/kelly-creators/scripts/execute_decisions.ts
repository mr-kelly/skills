#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved creator engagements, re-checks
// the agent lock and decisions, and records concrete handoff operations in
// execution_report.json. It performs NO external side effects: real sends
// (outreach DMs, briefs, contracts) are delegated to other skills (for example
// instagram-outreach or kelly-email) per SKILL.md.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "creator_snapshot.json");
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

interface Creator {
  creator_id: string;
  ref?: number;
  handle?: string;
  name?: string;
  platform?: string;
  channel?: string;
  status?: string;
  reason?: string;
  proposed_action?: string;
  est_rate?: number;
  suggested_reply?: string;
  item_type?: string;
}

interface Snapshot {
  creators?: Creator[];
}

interface ExecutionResultItem {
  creator_id: string;
  ref?: number;
  status: string;
  operation: string;
  channel?: string;
  format?: string;
  draft_id?: string;
  target?: string;
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

// Map the approved proposed_action to a concrete connector operation.
const OPERATION_BY_ACTION: Record<string, { operation: string; format?: string }> = {
  send_outreach: { operation: "send_outreach" },
  send_brief: { operation: "send_brief", format: "pdf" },
  draft_contract: { operation: "draft_contract", format: "pdf" },
  no_action: { operation: "none" },
};

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
const alreadyHandedOff = new Set(
  (previousReport?.results || []).filter((item) => item.status === "handed_off").map((item) => item.creator_id),
);

const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];

for (const creator of snapshot.creators || []) {
  const decision = decisions[creator.creator_id];
  if (!decision || decision.action !== "approve") continue;
  const proposed = creator.proposed_action || "no_action";
  const mapping = OPERATION_BY_ACTION[proposed] || OPERATION_BY_ACTION.no_action;
  if (creator.status === "done" || alreadyHandedOff.has(creator.creator_id)) {
    results.push({
      creator_id: creator.creator_id,
      ref: creator.ref,
      status: "skipped",
      operation: "none",
      reason: "Already handed off or marked done; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }
  if (mapping.operation === "none") {
    results.push({
      creator_id: creator.creator_id,
      ref: creator.ref,
      status: "skipped",
      operation: "none",
      reason: "Approved with no_action; nothing to hand off.",
      executed_at: now,
    });
    continue;
  }
  results.push({
    creator_id: creator.creator_id,
    ref: creator.ref,
    status: apply ? "handed_off" : "dry_run",
    operation: mapping.operation,
    channel: creator.channel || creator.platform || "",
    format: mapping.format,
    draft_id: `draft-${creator.creator_id}`,
    target: creator.handle || creator.name || creator.creator_id,
    draft: decision.draft ?? creator.suggested_reply ?? "",
    comment: decision.comment || "",
    reason: creator.reason || "",
    executed_at: now,
  });
}

if (!results.length) {
  console.log("No approved creator engagements to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `#${result.ref} ${result.creator_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve handed_off history so repeated --apply runs stay idempotent:
// a "skipped" result never replaces the handed_off record it refers to.
const freshlyHandedOff = new Set(results.filter((item) => item.status === "handed_off").map((item) => item.creator_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "handed_off" && !freshlyHandedOff.has(item.creator_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.creator_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-creators",
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.creator_id))),
  ],
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}. Real sends must be performed by the delegated skill per SKILL.md.`);
