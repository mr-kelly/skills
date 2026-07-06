#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved sends, re-checks the agent
// lock and decisions, and records concrete ESP handoff operations in
// execution_report.json. It performs NO external side effects: real scheduling
// and sending is delegated to the configured ESP by the skill, post-approval,
// per SKILL.md.
//
// Storage is reached only through the data-provider layer (lib/), so this runs
// against local files (default) or Busabase via KELLY_CAMPAIGNS_DATA_PROVIDER.
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
  body?: string;
  chosen_variant?: string;
}

interface Deliverability {
  risk?: string;
}

interface QualityGate {
  verdict?: string;
}

interface Send {
  send_id: string;
  ref?: number;
  type?: string;
  segment_id?: string;
  status?: string;
  proposed_action?: string;
  send_at?: string;
  reason?: string;
  body?: string;
  deliverability?: Deliverability;
  quality_gate?: QualityGate | null;
}

interface Snapshot {
  source?: string;
  sends?: Send[];
}

interface ExecutionResultItem {
  send_id: string;
  ref?: number;
  status: string;
  operation: string;
  esp?: string;
  segment_id?: string;
  send_at?: string;
  variants?: number;
  chosen_variant?: string;
  reason?: string;
  executed_at: string;
}

interface ExecutionReport {
  results?: ExecutionResultItem[];
}

interface DecisionsFile {
  decisions?: Record<string, Decision>;
}

const esp = process.env.KELLY_CAMPAIGNS_ESP || "configured-esp";

const lock = (await provider.readLock()) as Lock | null;
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = (await provider.readSnapshot()) as Snapshot | null;
if (!snapshot || !snapshot.sends) {
  console.error("No snapshot available. Nothing to execute.");
  process.exit(1);
}

const decisions = ((await provider.readDecisions()) as DecisionsFile)?.decisions || {};
const previousReport = (await provider.readExecutionReport()) as ExecutionReport | null;
const alreadyScheduled = new Set(
  (previousReport?.results || []).filter((item) => item.status === "scheduled").map((item) => item.send_id),
);

const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];

for (const send of snapshot.sends || []) {
  const decision = decisions[send.send_id];
  if (!decision || decision.action !== "approve") continue;

  // Safety gate: never schedule a send the SEND audit blocked or with high
  // deliverability risk, even if a stale approve decision exists.
  if (send.quality_gate?.verdict === "block" || send.deliverability?.risk === "high") {
    results.push({
      send_id: send.send_id,
      ref: send.ref,
      status: "blocked",
      operation: "none",
      reason: "Quality gate BLOCK or high deliverability risk; refusing to schedule.",
      executed_at: now,
    });
    continue;
  }

  if (send.status === "done" || alreadyScheduled.has(send.send_id)) {
    results.push({
      send_id: send.send_id,
      ref: send.ref,
      status: "skipped",
      operation: "none",
      reason: "Already scheduled or sent; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }

  const isAbTest = send.proposed_action === "ab_test";
  results.push({
    send_id: send.send_id,
    ref: send.ref,
    status: apply ? "scheduled" : "dry_run",
    operation: isAbTest ? "ab_test" : "schedule_send",
    esp,
    segment_id: send.segment_id || "",
    send_at: send.send_at || "",
    variants: isAbTest ? 2 : undefined,
    chosen_variant: decision.chosen_variant || undefined,
    reason: send.reason || "",
    executed_at: now,
  });
}

if (!results.length) {
  console.log("No approved sends to schedule.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `#${result.ref} ${result.send_id}: ${result.status} ${result.operation}${result.segment_id ? ` -> ${result.segment_id}` : ""}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write the execution report.`);
  process.exit(0);
}

// Preserve scheduled history so repeated --apply runs stay idempotent:
// a "skipped" result never replaces the scheduled record it refers to.
const freshlyScheduled = new Set(results.filter((item) => item.status === "scheduled").map((item) => item.send_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "scheduled" && !freshlyScheduled.has(item.send_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.send_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-campaigns",
  esp,
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.send_id))),
  ],
};
const written = await provider.writeExecutionReport(report);
console.log(
  `Wrote ${written.path || "execution report"}. Real scheduling/sending must be performed by the ESP per SKILL.md.`,
);
