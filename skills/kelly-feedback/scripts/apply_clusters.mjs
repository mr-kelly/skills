#!/usr/bin/env node
// Deterministic write path for agent-produced clustering. The clustering
// itself is LLM work done by the agent (see SKILL.md); this script only
// validates and merges cluster assignments and request drafts into Busabase.
// Ported from the retired scripts/apply_clusters.ts: same validation rules,
// same request-draft upsert semantics (existing requests get their fields
// patched and a decision_history entry appended; new requests are created
// with a "created" entry), same feedback assignment semantics (empty
// request_id unassigns; combine with `triage` to mark ignored/insight) —
// only the storage target changed, from app/.data/feedback_snapshot.json to
// Busabase's requests/feedback Bases. request.frequency/weighted_score are
// derived client-side by feedback-model.js's recomputeDerived(), so this
// script never writes them.
//
// Usage: node scripts/apply_clusters.mjs assignments.json [--apply]
// Payload shape: see references/feedback-schema.md (Cluster Assignment Payload).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { REQUEST_STATUSES, TRENDS } from "../app/app/js/feedback-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/apply_clusters.mjs <assignments.json> [--apply]

Validates a cluster-assignment payload (see references/feedback-schema.md)
and merges it into Busabase: upserts request drafts (requests[]) and links
feedback items to requests (assignments[]). Without --apply this is a dry run
that only validates and prints a summary.`);
}

function fail(message) {
  console.error(`kelly-feedback apply_clusters: ${message}`);
  process.exit(1);
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
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-feedback-cluster",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-feedback-cluster",
    autoMerge: true,
  });
  return "created";
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const file = rawArgs.find((arg) => !arg.startsWith("--"));
  if (!file) fail("usage: node scripts/apply_clusters.mjs <assignments.json> [--apply]");

  const payload = JSON.parse(await fs.readFile(file, "utf8"));
  if (!payload || typeof payload !== "object") fail(`cannot read ${file}`);
  const requestDrafts = Array.isArray(payload.requests) ? payload.requests : [];
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
  if (!requestDrafts.length && !assignments.length) fail("payload needs requests[] and/or assignments[]");

  for (const [index, draft] of requestDrafts.entries()) {
    if (!draft.request_id) fail(`requests[${index}].request_id is required`);
    if (!draft.title) fail(`requests[${index}].title is required`);
    if (draft.status && !REQUEST_STATUSES.includes(draft.status))
      fail(`requests[${index}].status must be one of ${REQUEST_STATUSES.join("|")}`);
    if (draft.trend && !TRENDS.includes(draft.trend))
      fail(`requests[${index}].trend must be one of ${TRENDS.join("|")}`);
  }
  for (const [index, assignment] of assignments.entries()) {
    if (!assignment.feedback_id) fail(`assignments[${index}].feedback_id is required`);
    if (typeof assignment.request_id !== "string")
      fail(`assignments[${index}].request_id must be a string ("" to unassign)`);
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Feedback Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [requestRows, feedbackRows] = await Promise.all([
    readAll(client, declared("requests")),
    readAll(client, declared("feedback")),
  ]);
  const requestsById = new Map(requestRows.map((row) => [row.request_id, row]));
  const feedbackById = new Map(feedbackRows.map((row) => [row.feedback_id, row]));

  const now = new Date().toISOString();
  let upserted = 0;

  for (const draft of requestDrafts) {
    const existing = requestsById.get(draft.request_id);
    if (existing) {
      const history = parseJsonList(existing.decision_history);
      history.push({ at: now, actor: "agent", action: "updated", note: draft.note || "Cluster draft updated." });
      const fields = {
        request_id: draft.request_id,
        title: draft.title ?? existing.title ?? "",
        product: draft.product ?? existing.product ?? "",
        status: draft.status ?? existing.status ?? "candidate",
        trend: draft.trend ?? existing.trend ?? "flat",
        effort_estimate: draft.effort_estimate ?? existing.effort_estimate ?? "",
        problem_statement: draft.problem_statement ?? existing.problem_statement ?? "",
        spec_summary: draft.spec_summary ?? existing.spec_summary ?? "",
        representative_feedback_ids: JSON.stringify(
          draft.representative_feedback_ids ?? parseJsonList(existing.representative_feedback_ids),
        ),
        decision_history: JSON.stringify(history),
        created_at: existing.created_at || now,
        updated_at: now,
      };
      await upsertRow(client, declared("requests"), existing, fields, `Update request ${draft.request_id}`, apply);
      requestsById.set(draft.request_id, { ...existing, ...fields });
    } else {
      const history = [
        { at: now, actor: "agent", action: "created", note: draft.note || "Created from cluster assignments." },
      ];
      const fields = {
        request_id: draft.request_id,
        title: draft.title,
        product: draft.product || "",
        status: draft.status || "candidate",
        trend: draft.trend || "flat",
        effort_estimate: draft.effort_estimate || "",
        problem_statement: draft.problem_statement || "",
        spec_summary: draft.spec_summary || "",
        representative_feedback_ids: JSON.stringify(draft.representative_feedback_ids || []),
        decision_history: JSON.stringify(history),
        created_at: now,
        updated_at: now,
      };
      await upsertRow(client, declared("requests"), null, fields, `Create request ${draft.request_id}`, apply);
      requestsById.set(draft.request_id, fields);
    }
    upserted += 1;
  }

  let assigned = 0;
  for (const assignment of assignments) {
    const item = feedbackById.get(assignment.feedback_id);
    if (!item) fail(`assignments reference unknown feedback: ${assignment.feedback_id}`);
    if (assignment.request_id && !requestsById.has(assignment.request_id)) {
      fail(`assignments reference unknown request: ${assignment.request_id}`);
    }
    const fields = {
      feedback_id: item.feedback_id,
      source_id: item.source_id || "",
      channel: item.channel || "",
      product: item.product || "",
      user_handle: item.user_handle || "",
      user_plan: item.user_plan || "",
      user_tenure_months: item.user_tenure_months ?? 0,
      user_weight: item.user_weight ?? 1,
      text: item.text || "",
      sentiment: item.sentiment || "neutral",
      received_at: item.received_at || "",
      permalink: item.permalink || "",
      request_id: assignment.request_id,
      triage: assignment.request_id ? "clustered" : assignment.triage || "new",
      agent_note: assignment.agent_note !== undefined ? String(assignment.agent_note) : item.agent_note || "",
    };
    await upsertRow(client, declared("feedback"), item, fields, `Assign feedback ${item.feedback_id}`, apply);
    feedbackById.set(item.feedback_id, { ...item, ...fields });
    assigned += 1;
  }

  await upsertRow(
    client,
    declared("sync_log"),
    null,
    {
      sync_id: `cluster-${Date.now()}`,
      at: now,
      actor: "agent",
      action: "cluster",
      detail: `Applied cluster assignments: ${assigned} feedback item(s), ${upserted} request draft(s) upserted.`,
      count: assigned,
    },
    "Cluster run log",
    apply,
  );

  console.log(
    `${apply ? "Upserted" : "Would upsert"} ${upserted} request(s); ${apply ? "assigned" : "would assign"} ${assigned} feedback item(s).`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
