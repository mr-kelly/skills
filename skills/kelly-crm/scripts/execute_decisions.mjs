#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved follow-ups, re-checks the
// agent lock and decisions, and records concrete handoff operations in
// execution_report.json. It performs NO external side effects: real sending is
// delegated to other skills (for example kelly-email) per SKILL.md.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "crm_snapshot.json");
const decisionsPath = path.join(dataDir, "decisions.json");
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
const alreadyHandedOff = new Set(
  (previousReport?.results || []).filter((item) => item.status === "handed_off").map((item) => item.followup_id)
);

const contacts = new Map((snapshot.contacts || []).map((item) => [item.contact_id, item]));
const now = new Date().toISOString();
const results = [];

for (const followup of snapshot.followups || []) {
  const decision = decisions[followup.followup_id];
  if (!decision || decision.action !== "approve") continue;
  if (followup.status === "done" || alreadyHandedOff.has(followup.followup_id)) {
    results.push({
      followup_id: followup.followup_id,
      ref: followup.ref,
      status: "skipped",
      operation: "none",
      reason: "Already handed off or marked done; skipping to stay idempotent.",
      executed_at: now
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
    executed_at: now
  });
}

if (!results.length) {
  console.log("No approved follow-ups to execute.");
  process.exit(0);
}

for (const result of results) {
  console.log(`#${result.ref} ${result.followup_id}: ${result.status} ${result.operation}${result.target ? ` -> ${result.target}` : ""}`);
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve handed_off history so repeated --apply runs stay idempotent:
// a "skipped" result never replaces the handed_off record it refers to.
const freshlyHandedOff = new Set(results.filter((item) => item.status === "handed_off").map((item) => item.followup_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "handed_off" && !freshlyHandedOff.has(item.followup_id)
);
const carriedIds = new Set(carriedForward.map((item) => item.followup_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-crm",
  results: [...carriedForward, ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.followup_id)))]
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}. Real sending must be performed by the delegated skill per SKILL.md.`);
