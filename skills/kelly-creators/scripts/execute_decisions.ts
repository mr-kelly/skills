#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved creator engagements, re-checks
// the agent lock and decisions, and records concrete handoff operations in
// execution_report.json. It performs NO external side effects: real sends
// (outreach DMs, briefs, contracts) are delegated to other skills (for example
// instagram-outreach or kelly-email) per SKILL.md.
//
// Storage is reached only through the data-provider layer (lib/), so this runs
// against local files (default) or Busabase via KELLY_CREATORS_DATA_PROVIDER.
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
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

const lock = (await provider.readLock()) as Lock | null;
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = (await provider.readSnapshot()) as Snapshot | null;
if (!snapshot || !snapshot.creators) {
  console.error("No snapshot available. Nothing to execute.");
  process.exit(1);
}

const decisions = ((await provider.readDecisions()) as DecisionsFile)?.decisions || {};
const previousReport = (await provider.readExecutionReport()) as ExecutionReport | null;
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
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write the execution report.`);
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
const written = await provider.writeExecutionReport(report);
console.log(
  `Wrote ${written.path || "execution report"}. Real sends must be performed by the delegated skill per SKILL.md.`,
);
