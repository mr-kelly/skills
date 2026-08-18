#!/usr/bin/env node
// Dry-run execution planner — reads APPROVED action cards from Busabase and
// prints the concrete operation the agent must perform outside the app
// (renew_domain/rotate_key/investigate_spend/restart_service/ack_incident).
// operationFor is ported verbatim from the retired scripts/execute_decisions.ts.
//
// This script performs NO external side effects by default: it never
// renews a domain, rotates a key, or restarts a service, matching the
// original stub's safety boundary exactly (see SKILL.md's Boundary
// section — those operations are approval-required and executed by the
// agent outside the app, with the user's own tools).
//
// Usage:
//   node scripts/execute_decisions.mjs                 Print the plan for every approved action (default).
//   node scripts/execute_decisions.mjs --complete <action_id> --note "..."
//                                                        After the agent has performed the real external
//                                                        action manually, mark that one action card `done`
//                                                        and append an event. This is the ONLY write path
//                                                        this script has, and it never runs implicitly.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { operationFor } from "../app/app/js/devops-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--complete <action_id> --note "what was done"]

Without --complete, prints the planned operation for every action card with
status approved. Performs no external side effects and no Busabase writes.

With --complete <action_id>, marks that one action card done (it must
already be approved) and appends an event — only after the agent has
performed the real external action manually with the user's own tools.
Requires --note describing what was done.`);
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

function parseJsonList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const completeIndex = argv.indexOf("--complete");
  const noteIndex = argv.indexOf("--note");
  const completeActionId = completeIndex >= 0 ? argv[completeIndex + 1] : "";
  const note = noteIndex >= 0 ? argv[noteIndex + 1] : "";

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly DevOps Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const actionRows = await readAll(client, declared("actions"));
  /** @type {Array<Record<string, any>>} */
  const actions = actionRows.map((row) => ({
    ...row,
    evidence: parseJsonList(row.evidence),
    plan: parseJsonList(row.plan),
    target: parseJsonObject(row.target),
  }));

  if (completeActionId) {
    if (!note) {
      console.error("execute_decisions: --complete requires --note describing what was done.");
      process.exitCode = 1;
      return;
    }
    const action = actions.find((item) => item.action_id === completeActionId);
    if (!action) {
      console.error(`execute_decisions: unknown action ${completeActionId}.`);
      process.exitCode = 1;
      return;
    }
    if (action.status !== "approved") {
      console.error(
        `execute_decisions: action ${completeActionId} is "${action.status}", not "approved". Refusing to mark done.`,
      );
      process.exitCode = 1;
      return;
    }
    const now = new Date().toISOString();
    await client.records.changeRequest({
      recordId: action.__recordId,
      operation: "update",
      fields: toBusabaseFields({
        action_id: action.action_id,
        ref: action.ref,
        type: action.type,
        title: action.title,
        status: "done",
        reason: action.reason,
        evidence: JSON.stringify(action.evidence),
        plan: JSON.stringify(action.plan),
        target: JSON.stringify(action.target),
        note: String(note),
        created_at: action.created_at,
        decision_verdict: action.decision_verdict || "approve",
        decision_note: action.decision_note || "",
        decided_at: action.decided_at || "",
      }),
      message: `Mark action ${completeActionId} done`,
      author: "kelly-devops-execute-decisions",
      baseCommitId: action.__headCommitId,
      autoMerge: true,
    });
    const eventId = `evt-action-done-${Date.now()}`;
    await client.bases.createChangeRequest({
      baseId: declared("events").baseId,
      fields: toBusabaseFields({
        event_id: eventId,
        at: now,
        severity: "info",
        kind: "action",
        message: `Action #${action.ref} completed: ${action.title}. ${note}`,
        service_id: action.target?.service_id || action.target?.id || "",
      }),
      message: `Event ${eventId}`,
      submittedBy: "kelly-devops-execute-decisions",
      autoMerge: true,
    });
    console.log(`Marked Action #${action.ref} (${completeActionId}) done.`);
    return;
  }

  const approved = actions.filter((action) => {
    const verdict = action.decision_verdict;
    return action.status === "approved" && verdict !== "block";
  });

  if (!approved.length) {
    console.log("No approved actions to plan. Approve action cards in the app first.");
    return;
  }

  for (const action of approved) {
    const planned = operationFor(action);
    console.log(`- Action #${action.ref} ${planned.operation} -> ${JSON.stringify(planned.target)}`);
    console.log(`    ${planned.note}`);
  }
  console.log(
    `Planned ${approved.length} operation(s), dry-run only. The agent executes them outside the app after review, then re-runs with --complete <action_id> --note "..." to mark it done.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
