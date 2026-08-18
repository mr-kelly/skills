#!/usr/bin/env node
// Trusted hand-off step. Kelly Standup's AirApp only ever writes a human
// verdict (approve / request_changes / revise / block) onto a reminder
// record in Busabase — sending the actual nudge is explicitly out of the
// app's boundary (see SKILL.md's Boundary and Reminder Workflow sections).
// This script performs NO external side effect: it never calls Slack/WeCom/
// Discord/WhatsApp/email itself. It reads reminders with status "approved",
// builds the same "send_reminder" operation plan the retired
// scripts/execute_decisions.ts produced (channel/target/contact_env/
// contact_ready/message_draft), and — only with --apply — writes that plan
// back onto each reminder record as execution_status "ready_for_agent" so
// the agent can pick it up and send the real message via kelly-messenger /
// kelly-email, then record the outcome. Without --apply this is a dry run
// that only prints the plan; nothing is written to Busabase either way
// unless --apply is given, matching the decision-execution convention used
// by kelly-campaigns/kelly-pr-review's execute_decisions.mjs (the retired
// TS version always wrote its local execution_report.json even on a dry
// run; gating the Busabase write behind --apply is the safer adaptation for
// shared, multi-writer state).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads reminders with status "approved" from Busabase and builds a
send_reminder operation plan (channel, target, contact_env, contact_ready,
message draft) for each. Without --apply this is a dry run that only prints
the plan. With --apply it writes execution_status "ready_for_agent" plus the
plan back onto each reminder record. It never sends a message itself — the
agent sends the real nudge via kelly-messenger/kelly-email after this plan is
reviewed, then records the outcome, per SKILL.md's Reminder Workflow.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Standup Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);
  const [memberRows, reminderRows] = await Promise.all([
    readAll(client, declared("members")),
    readAll(client, declared("reminders")),
  ]);
  const membersById = new Map(memberRows.map((row) => [row.member_id, row]));

  const approved = reminderRows.filter((row) => row.status === "approved");
  if (!approved.length) {
    console.log("No approved reminders to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  const results = [];
  for (const reminder of approved) {
    const member = membersById.get(reminder.member_id);
    if (!member) {
      results.push({
        id: reminder.reminder_id,
        member_id: reminder.member_id,
        operations: [],
        status: "blocked",
        detail: `Member ${reminder.member_id} is not in the roster; fix the members Base or re-ingest before executing.`,
      });
      continue;
    }
    const contactEnv = member.contact_env || "";
    const contactReady = Boolean(contactEnv && process.env[contactEnv]);
    const operations = [
      {
        operation: "send_reminder",
        channel: reminder.channel,
        target: reminder.member_id,
        contact_env: contactEnv,
        contact_ready: contactReady,
        message_draft: reminder.draft || "",
      },
    ];
    const detail = apply
      ? `Approved: agent should send this via kelly-messenger/kelly-email${contactReady ? "" : ` after configuring ${contactEnv || "a contact env"}`}, then record the outcome.`
      : `Dry run: would hand the ${reminder.channel} draft for ${member.name} to the agent.${contactReady ? "" : ` Contact env ${contactEnv || "(unset)"} is not configured.`}`;
    results.push({
      id: reminder.reminder_id,
      member_id: reminder.member_id,
      operations,
      status: apply ? "ready_for_agent" : "planned",
      detail,
    });

    if (apply) {
      const current = normalizeFields(reminder);
      await client.records.changeRequest({
        recordId: reminder.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...current,
          execution_status: "ready_for_agent",
          execution_operations: JSON.stringify(operations),
          execution_detail: detail,
          executed_at: now,
        }),
        message: `Plan reminder execution for ${reminder.reminder_id}`,
        author: "kelly-standup-executor",
        baseCommitId: reminder.__headCommitId,
        autoMerge: true,
      });
    }
  }

  console.log(JSON.stringify({ executed_at: now, dry_run: !apply, source: "kelly-standup", results }, null, 2));
  for (const result of results) {
    console.log(
      `  ${result.id} -> ${result.operations.map((op) => `${op.operation}(${op.channel})`).join(" + ") || "blocked"} (${result.status}) ${result.member_id}`,
    );
  }
  if (!apply)
    console.log("Re-run with --apply to write the plan onto reminder records. No external side effects either way.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
