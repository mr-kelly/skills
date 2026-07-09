#!/usr/bin/env node
// Dry-run-by-default executor. Reads approved tickets and decisions THROUGH the
// data provider, re-checks the agent lock and the support-qa quality gate, then
// records concrete handoff operations in execution_report.json. It performs NO
// external side effects: real sends / escalations / refunds are delegated to the
// configured channel connectors by the skill, post-approval, per SKILL.md.
//
//   operation: send_reply, channel, draft_id  — a KB-grounded reply to the customer
//   operation: escalate, tier                 — hand off to a higher tier
//   operation: refund, amount                  — approval-required, high-risk
//   operation: close                           — resolve with no reply
//
// Refund/escalate are approval-required: without an approve decision AND a
// non-BLOCK gate they are never scheduled.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const reportPath = path.join(dataDir, "execution_report.json");

const apply = process.argv.includes("--apply");

interface Decision {
  action?: string;
  comment?: string;
}

interface Ticket {
  ticket_id: string;
  ref?: number;
  channel?: string;
  status?: string;
  proposed_action?: string;
  reason?: string;
  suggested_reply?: string;
  provider_conversation_id?: string;
  quality_gate?: { verdict?: string } | null;
  execution?: { amount?: number; tier?: string } | null;
}

interface ExecutionResultItem {
  ticket_id: string;
  ref?: number;
  status: string;
  operation: string;
  channel?: string;
  target?: string;
  tier?: string;
  amount?: number;
  draft_id?: string;
  reason?: string;
  executed_at: string;
}

interface ExecutionReport {
  results?: ExecutionResultItem[];
}

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

const provider = await createProvider();

const lock = await provider.readLock();
if (lock) {
  const owner = (lock as Record<string, unknown>).owner || "unknown";
  const message = (lock as Record<string, unknown>).message || "";
  console.error(`Refusing to execute: agent.lock is active (${owner}: ${message}).`);
  process.exit(1);
}

const state = await provider.getState();
const snapshot = state.snapshot as { tickets?: Ticket[] } | null;
if (!snapshot) {
  console.error("No snapshot available from the data provider. Nothing to execute.");
  process.exit(1);
}

const decisions = ((state.decisions as { decisions?: Record<string, Decision> })?.decisions || {}) as Record<
  string,
  Decision
>;
const previousReport = await readJson<ExecutionReport>(reportPath);
const alreadySent = new Set(
  (previousReport?.results || []).filter((item) => item.status === "sent").map((item) => item.ticket_id),
);

const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];

for (const ticket of snapshot.tickets || []) {
  const decision = decisions[ticket.ticket_id];
  // The ticket's own status is the effective decision: decisions.json can go
  // stale (e.g. re-saving an edited reply resets status to needs_review and
  // clears ticket.decision without touching decisions.json), so a lingering
  // "approve" entry alone must never trigger a send.
  if (!decision || decision.action !== "approve" || ticket.status !== "approved") continue;

  // Safety gate: never execute a ticket the support-qa audit blocked, even if a
  // stale approve decision exists.
  if (ticket.quality_gate?.verdict === "block") {
    results.push({
      ticket_id: ticket.ticket_id,
      ref: ticket.ref,
      status: "blocked",
      operation: "none",
      reason: "support-qa gate BLOCK; refusing to send (refund/commitment without approval or ungrounded).",
      executed_at: now,
    });
    continue;
  }

  if (alreadySent.has(ticket.ticket_id)) {
    results.push({
      ticket_id: ticket.ticket_id,
      ref: ticket.ref,
      status: "skipped",
      operation: "none",
      reason: "Already sent; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }

  const action = ticket.proposed_action || "send_reply";
  const base: ExecutionResultItem = {
    ticket_id: ticket.ticket_id,
    ref: ticket.ref,
    status: apply ? "sent" : "dry_run",
    operation: action,
    channel: ticket.channel,
    executed_at: now,
  };
  if (action === "send_reply") {
    base.target = ticket.provider_conversation_id || "";
    base.draft_id = `reply-${ticket.ticket_id}`;
  } else if (action === "escalate") {
    base.operation = "escalate";
    base.tier = ticket.execution?.tier || "tier2";
  } else if (action === "refund") {
    base.operation = "refund";
    base.amount = Number(ticket.execution?.amount || 0);
  } else if (action === "close") {
    base.operation = "close";
  } else {
    base.operation = "no_action";
    base.status = "skipped";
    base.reason = "Proposed action is no_action.";
  }
  results.push(base);
}

if (!results.length) {
  console.log("No approved tickets to execute.");
  process.exit(0);
}

for (const result of results) {
  const extra =
    result.operation === "refund"
      ? ` amount ${result.amount}`
      : result.operation === "escalate"
        ? ` -> ${result.tier}`
        : result.target
          ? ` -> ${result.target}`
          : "";
  console.log(`#${result.ref} ${result.ticket_id}: ${result.status} ${result.operation}${extra}`);
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve sent history so repeated --apply runs stay idempotent: a "skipped"
// result never replaces the sent record it refers to.
const freshlySent = new Set(results.filter((item) => item.status === "sent").map((item) => item.ticket_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "sent" && !freshlySent.has(item.ticket_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.ticket_id));
const report = {
  report_id: `exec-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
  mode: "send",
  executed_at: now,
  source: "kelly-support",
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.ticket_id))),
  ],
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${reportPath}. Real sends / escalations / refunds are performed by the channel connectors per SKILL.md.`,
);
