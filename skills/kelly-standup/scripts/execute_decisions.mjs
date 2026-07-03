#!/usr/bin/env node
// Dry-run-by-default execution stub for approved reminders. Re-checks the
// agent lock and decisions, then writes execution_report.json entries with
// concrete operations (send_reminder message-draft handoffs). It performs NO
// external side effects: the agent sends the actual nudges outside the app —
// via kelly-messenger / kelly-email — after this plan is reviewed.
// Usage: node scripts/execute_decisions.mjs [--apply]

import fs from "node:fs/promises";
import { EXECUTION_REPORT_PATH, LOCK_PATH } from "../app/server/paths.mjs";
import {
  ensureDirs,
  mergeSnapshot,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readSnapshot,
  writeJson
} from "../app/server/store.mjs";

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function fail(message) {
  console.error(`kelly-standup execute: ${message}`);
  process.exit(1);
}

await ensureDirs();

const existingLock = await readLock();
if (existingLock) {
  fail(`agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`);
}

const [snapshot, decisions, previousReport, configResult] = await Promise.all([
  readSnapshot(),
  readDecisions(),
  readExecutionReport(),
  readConfig()
]);
const merged = mergeSnapshot(snapshot, decisions, previousReport);
const approved = merged.reminders.filter((reminder) => reminder.status === "approved");

if (!approved.length) {
  console.log("No approved reminders to execute. Nothing written.");
  process.exit(0);
}

await writeJson(LOCK_PATH, {
  owner: "kelly-standup",
  message: dryRun ? "Dry-run: planning approved reminders" : "Preparing approved reminders for the agent",
  started_at: new Date().toISOString()
});

try {
  const configMembers = new Map((configResult.config.members || []).map((member) => [member.member_id, member]));
  const snapshotMembers = new Map((merged.members || []).map((member) => [member.member_id, member]));
  const results = approved.map((reminder) => {
    const member = snapshotMembers.get(reminder.member_id);
    if (!member) {
      return {
        id: reminder.id,
        ref: reminder.ref,
        title: reminder.title,
        member_id: reminder.member_id,
        operations: [],
        status: "blocked",
        detail: `Member ${reminder.member_id} is not in the snapshot roster; fix the config or re-ingest before executing.`
      };
    }
    const contactEnv = configMembers.get(reminder.member_id)?.contact_env || "";
    const contactReady = Boolean(contactEnv && process.env[contactEnv]);
    return {
      id: reminder.id,
      ref: reminder.ref,
      title: reminder.title,
      member_id: reminder.member_id,
      operations: [
        {
          operation: "send_reminder",
          channel: reminder.channel,
          target: reminder.member_id,
          contact_env: contactEnv,
          contact_ready: contactReady,
          message_draft: reminder.draft || ""
        }
      ],
      status: dryRun ? "planned" : "ready_for_agent",
      detail: dryRun
        ? `Dry run: would hand the ${reminder.channel} draft for ${member.name} to the agent.${contactReady ? "" : ` Contact env ${contactEnv || "(unset)"} is not configured.`}`
        : `Approved: agent should send this via kelly-messenger/kelly-email${contactReady ? "" : ` after configuring ${contactEnv || "a contact env"}`}, then record the outcome here.`
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    source: "kelly-standup",
    config_path: configResult.path,
    results
  };
  await writeJson(EXECUTION_REPORT_PATH, report);
  console.log(`${dryRun ? "Dry run" : "Execution plan"} wrote ${EXECUTION_REPORT_PATH}`);
  for (const result of results) {
    console.log(`  Reminder #${result.ref} -> ${result.operations.map((op) => `${op.operation}(${op.channel})`).join(" + ") || "blocked"} (${result.status}) ${result.member_id}`);
  }
  if (dryRun) console.log("Re-run with --apply to mark items ready_for_agent. No external side effects either way.");
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
