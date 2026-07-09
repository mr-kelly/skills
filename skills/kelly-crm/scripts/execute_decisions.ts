#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved follow-ups, re-checks the
// agent lock and decisions, and records concrete handoff operations in
// execution_report.json. It performs NO external side effects: real sending is
// delegated to other skills (for example kelly-email) per SKILL.md.
//
// Storage is reached only through the data-provider layer (lib/), so this runs
// against local files (default) or Busabase via KELLY_CRM_DATA_PROVIDER.
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
const apply = process.argv.includes("--apply");

interface Contact {
  contact_id: string;
  name?: string;
  email?: string;
}

interface Lock {
  owner?: string;
  message?: string;
}

interface Decision {
  action?: string;
  comment?: string;
  draft?: string;
  decided_at?: string;
}

interface Followup {
  followup_id: string;
  ref?: number;
  contact_id: string;
  channel_id?: string;
  channel_type?: string;
  status?: string;
  reason?: string;
  suggested_reply?: string;
}

interface Snapshot {
  contacts?: Contact[];
  followups?: Followup[];
  generated_at?: string;
}

interface ExecutionResultItem {
  followup_id: string;
  ref?: number;
  status: string;
  operation: string;
  channel?: string;
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

const lock = (await provider.readLock()) as Lock | null;
if (lock) {
  console.error(`Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = (await provider.readSnapshot()) as Snapshot | null;
if (!snapshot || !(snapshot.followups || snapshot.contacts)) {
  console.error("No snapshot available. Nothing to execute.");
  process.exit(1);
}

const decisions = ((await provider.readDecisions()) as DecisionsFile)?.decisions || {};
const previousReport = (await provider.readExecutionReport()) as ExecutionReport | null;
const alreadyHandedOff = new Set(
  (previousReport?.results || []).filter((item) => item.status === "handed_off").map((item) => item.followup_id),
);

const contacts = new Map<string, Contact>((snapshot.contacts || []).map((item) => [item.contact_id, item]));
const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];
const generatedAt = Date.parse(snapshot.generated_at || "") || 0;

for (const followup of snapshot.followups || []) {
  const decision = decisions[followup.followup_id];
  if (!decision || decision.action !== "approve") continue;
  // A decision is only a real human approval if it was decided at or after
  // the snapshot it applies to. A stale approval (decided before the
  // snapshot regenerated with new content) must not be handed off, mirroring
  // app.js effectiveStatus().
  const decidedAt = Date.parse(decision.decided_at || "") || 0;
  if (decidedAt < generatedAt) {
    results.push({
      followup_id: followup.followup_id,
      ref: followup.ref,
      status: "skipped",
      operation: "none",
      reason: "Approval is stale relative to the current snapshot; needs re-review.",
      executed_at: now,
    });
    continue;
  }
  if (followup.status === "done" || alreadyHandedOff.has(followup.followup_id)) {
    results.push({
      followup_id: followup.followup_id,
      ref: followup.ref,
      status: "skipped",
      operation: "none",
      reason: "Already handed off or marked done; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }
  const contact = contacts.get(followup.contact_id);
  const channelType = followup.channel_type || "email";
  results.push({
    followup_id: followup.followup_id,
    ref: followup.ref,
    status: apply ? "handed_off" : "dry_run",
    operation: `handoff_to_${channelType}`,
    channel: followup.channel_id || "",
    target: contact?.email || contact?.name || followup.contact_id,
    draft: decision.draft ?? followup.suggested_reply ?? "",
    comment: decision.comment || "",
    reason: followup.reason || "",
    executed_at: now,
  });
}

if (!results.length) {
  console.log("No approved follow-ups to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `#${result.ref} ${result.followup_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write the execution report.`);
  process.exit(0);
}

// Preserve handed_off history so repeated --apply runs stay idempotent:
// a "skipped" result never replaces the handed_off record it refers to.
const freshlyHandedOff = new Set(
  results.filter((item) => item.status === "handed_off").map((item) => item.followup_id),
);
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "handed_off" && !freshlyHandedOff.has(item.followup_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.followup_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-crm",
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.followup_id))),
  ],
};
const written = await provider.writeExecutionReport(report);
console.log(
  `Wrote ${written.path || "execution report"}. Real sending must be performed by the delegated skill per SKILL.md.`,
);
