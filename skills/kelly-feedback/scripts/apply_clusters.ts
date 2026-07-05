#!/usr/bin/env node
// Deterministic write path for agent-produced clustering. The clustering
// itself is LLM work done by the agent (see SKILL.md); this script only
// validates and merges cluster assignments and request drafts.
//
// Usage: node scripts/apply_clusters.mjs assignments.json
// Payload shape: see references/feedback-schema.md (Cluster Assignment Payload).
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import { acquireLock, readJson, recomputeDerived, releaseLock, writeJson } from "../app/server/store.ts";
import type { FeedbackSnapshot } from "../app/server/types.ts";

const REQUEST_STATUSES = ["candidate", "roadmap", "declined", "needs_info"];
const TRENDS = ["up", "flat", "down"];

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply_clusters.mjs <assignments.json>");
  process.exit(1);
}

function fail(message) {
  console.error(`Apply clusters failed: ${message}`);
  process.exit(1);
}

const payload = await readJson(file, null);
if (!payload || typeof payload !== "object") fail(`cannot read ${file}`);
const requestDrafts = Array.isArray(payload.requests) ? payload.requests : [];
const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
if (!requestDrafts.length && !assignments.length) fail("payload needs requests[] and/or assignments[]");

for (const [index, draft] of requestDrafts.entries()) {
  if (!draft.request_id) fail(`requests[${index}].request_id is required`);
  if (!draft.title) fail(`requests[${index}].title is required`);
  if (draft.status && !REQUEST_STATUSES.includes(draft.status))
    fail(`requests[${index}].status must be one of ${REQUEST_STATUSES.join("|")}`);
  if (draft.trend && !TRENDS.includes(draft.trend)) fail(`requests[${index}].trend must be one of ${TRENDS.join("|")}`);
}
for (const [index, assignment] of assignments.entries()) {
  if (!assignment.feedback_id) fail(`assignments[${index}].feedback_id is required`);
  if (typeof assignment.request_id !== "string")
    fail(`assignments[${index}].request_id must be a string ("" to unassign)`);
}

await acquireLock("Applying cluster assignments").catch((error) => fail(error.message));
try {
  const snapshot = (await readJson<FeedbackSnapshot>(SNAPSHOT_PATH, null)) as FeedbackSnapshot;
  if (!snapshot) fail(`no snapshot at ${SNAPSHOT_PATH}; run ingest_feedback.mjs first`);
  const now = new Date().toISOString();
  const requestsById = new Map(snapshot.requests.map((item) => [item.request_id, item]));
  let upserted = 0;

  for (const draft of requestDrafts) {
    const existing = requestsById.get(draft.request_id);
    if (existing) {
      for (const key of [
        "title",
        "product",
        "status",
        "trend",
        "problem_statement",
        "spec_summary",
        "effort_estimate",
        "representative_feedback_ids",
      ]) {
        if (draft[key] !== undefined) existing[key] = draft[key];
      }
      existing.updated_at = now;
      existing.decision_history.push({
        at: now,
        actor: "agent",
        action: "updated",
        note: draft.note || "Cluster draft updated.",
      });
    } else {
      const request = {
        request_id: draft.request_id,
        title: draft.title,
        product: draft.product || "",
        status: draft.status || "candidate",
        trend: draft.trend || "flat",
        frequency: 0,
        weighted_score: 0,
        problem_statement: draft.problem_statement || "",
        spec_summary: draft.spec_summary || "",
        effort_estimate: draft.effort_estimate || "",
        representative_feedback_ids: draft.representative_feedback_ids || [],
        decision_history: [
          { at: now, actor: "agent", action: "created", note: draft.note || "Created from cluster assignments." },
        ],
        created_at: now,
        updated_at: now,
      };
      snapshot.requests.push(request);
      requestsById.set(request.request_id, request);
    }
    upserted += 1;
  }

  const feedbackById = new Map(snapshot.feedback.map((item) => [item.feedback_id, item]));
  let assigned = 0;
  for (const assignment of assignments) {
    const item = feedbackById.get(assignment.feedback_id);
    if (!item) fail(`assignments reference unknown feedback: ${assignment.feedback_id}`);
    if (assignment.request_id && !requestsById.has(assignment.request_id)) {
      fail(`assignments reference unknown request: ${assignment.request_id}`);
    }
    item.request_id = assignment.request_id;
    item.triage = assignment.request_id ? "clustered" : assignment.triage || "new";
    if (assignment.agent_note !== undefined) item.agent_note = String(assignment.agent_note);
    assigned += 1;
  }

  snapshot.generated_at = now;
  snapshot.sync_log.push({
    at: now,
    actor: "agent",
    action: "cluster",
    detail: `Applied cluster assignments: ${assigned} feedback item(s), ${upserted} request draft(s) upserted.`,
    count: assigned,
  });
  recomputeDerived(snapshot);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Upserted ${upserted} request(s); assigned ${assigned} feedback item(s).`);
  console.log(`Wrote ${SNAPSHOT_PATH}`);
} finally {
  await releaseLock();
}
