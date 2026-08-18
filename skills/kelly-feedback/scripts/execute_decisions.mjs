#!/usr/bin/env node
// Trusted hand-off step. Reads proposals with status "approved" from
// Busabase. Dry-run by default; pass --apply to also apply LOCAL operations.
// Ported from the retired scripts/execute_decisions.ts: operationsFor() and
// the LOCAL_OPERATIONS set (update_roadmap, merge_requests) are unchanged —
// only local roadmap-lane/merge mutations are ever applied by this script.
// Outbound operations (publish_changelog_note, send_decline_reply) are NEVER
// sent by this script: it performs no external side effect — it never
// publishes a changelog, posts to a roadmap doc, or sends a reply. Real
// delivery is handed off to the agent via kelly-messenger/kelly-email/docs
// edits, only after this script's dry-run/--apply report, per SKILL.md's
// boundary. Once an approved proposal is processed under --apply (whether
// its operations were local or handoff-only) its status is set "done"
// directly on the proposal record, so a later run skips it — idempotent by
// reading the proposal's own live status (no separate execution_report file;
// Busabase reads are always live). There is no local decisions.json overlay
// anymore: the proposal's `status`/`review_note`/`draft` fields ARE the
// human's decision, written directly by the AirApp's decideProposal().
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads proposals with status "approved" from Busabase and prints what would be
executed: update_roadmap and merge_requests operations are LOCAL (applied
directly to Busabase's roadmap/requests Bases under --apply);
publish_changelog_note and send_decline_reply are always handoff_ready — this
script never publishes a changelog, edits a roadmap doc, or sends a reply
itself. Without --apply this is a dry run that only prints the plan.`);
}

function fail(message) {
  console.error(`kelly-feedback execute_decisions: ${message}`);
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

async function updateRow(client, existing, fields, message) {
  await client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-feedback-executor",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

async function createRow(client, declared, fields, message) {
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-feedback-executor",
    autoMerge: true,
  });
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

// Ported verbatim from the retired scripts/execute_decisions.ts.
function operationsFor(proposal, draft) {
  if (proposal.type === "promote_request") {
    return [
      { operation: "update_roadmap", target_lane: proposal.target_lane || "next", request_id: proposal.request_id },
      ...(draft ? [{ operation: "publish_changelog_note", draft_id: proposal.proposal_id, draft }] : []),
    ];
  }
  if (proposal.type === "decline_request") {
    return [
      {
        operation: "send_decline_reply",
        handoff: "kelly-messenger/kelly-email",
        draft_id: proposal.proposal_id,
        request_id: proposal.request_id,
        draft,
      },
    ];
  }
  if (proposal.type === "merge_requests") {
    return [{ operation: "merge_requests", request_id: proposal.request_id, request_ids: proposal.request_ids || [] }];
  }
  if (proposal.type === "publish_changelog") {
    return [
      { operation: "publish_changelog_note", draft_id: proposal.proposal_id, request_id: proposal.request_id, draft },
    ];
  }
  return [{ operation: "unknown", reason: `unsupported proposal type: ${proposal.type}` }];
}

const LOCAL_OPERATIONS = new Set(["update_roadmap", "merge_requests"]);

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
    throw new Error("Kelly Feedback Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [proposalRows, requestRows, roadmapRows] = await Promise.all([
    readAll(client, declared("proposals")),
    readAll(client, declared("requests")),
    readAll(client, declared("roadmap")),
  ]);
  const requestsById = new Map(requestRows.map((row) => [row.request_id, row]));
  const now = new Date().toISOString();

  const results = [];
  let approvedCount = 0;
  let executedCount = 0;
  let handoffCount = 0;
  let skippedCount = 0;

  for (const proposal of proposalRows) {
    if (proposal.status === "done") {
      results.push({
        proposal_id: proposal.proposal_id,
        operation: "no_op",
        status: "skipped",
        reason: "already done",
      });
      skippedCount += 1;
      continue;
    }
    if (proposal.status === "changes_requested") {
      results.push({
        proposal_id: proposal.proposal_id,
        operation: "revise_proposal",
        status: "skipped",
        reason: "queued for agent revision",
        note: proposal.review_note || "",
      });
      skippedCount += 1;
      continue;
    }
    if (proposal.status !== "approved") {
      results.push({
        proposal_id: proposal.proposal_id,
        operation: "no_op",
        status: "skipped",
        reason: `status is ${proposal.status}`,
      });
      skippedCount += 1;
      continue;
    }

    approvedCount += 1;
    const ops = operationsFor(proposal, proposal.draft || "");
    for (const op of ops) {
      const entry = { proposal_id: proposal.proposal_id, status: "planned", reason: "", ...op };
      if (!apply) {
        results.push(entry);
        continue;
      }
      if (op.operation === "update_roadmap") {
        const request = requestsById.get(op.request_id);
        const laneKey = op.target_lane || "next";
        const alreadyOnLane = roadmapRows.some((row) => row.lane === laneKey && row.request_id === op.request_id);
        if (!alreadyOnLane) {
          await createRow(
            client,
            declared("roadmap"),
            {
              item_id: `rm-${laneKey}-${op.request_id}`,
              lane: laneKey,
              title: request?.title || op.request_id,
              request_id: op.request_id,
              note: `Promoted via proposal ${proposal.proposal_id}.`,
            },
            `Promote ${op.request_id} to ${laneKey}`,
          );
        }
        if (request) {
          const history = parseJsonList(request.decision_history);
          history.push({
            at: now,
            actor: "kelly",
            action: "promoted",
            note: `Approved proposal ${proposal.proposal_id}: moved to ${laneKey}.`,
          });
          await updateRow(
            client,
            request,
            {
              request_id: request.request_id,
              title: request.title || "",
              product: request.product || "",
              status: "roadmap",
              trend: request.trend || "flat",
              effort_estimate: request.effort_estimate || "",
              problem_statement: request.problem_statement || "",
              spec_summary: request.spec_summary || "",
              representative_feedback_ids: request.representative_feedback_ids || "[]",
              decision_history: JSON.stringify(history),
              created_at: request.created_at || now,
              updated_at: now,
            },
            `Mark ${op.request_id} promoted`,
          );
        }
        entry.status = "executed";
        executedCount += 1;
      } else if (op.operation === "merge_requests") {
        const targetId = op.request_id;
        const target = requestsById.get(targetId);
        for (const sourceId of (op.request_ids || []).filter((id) => id !== targetId)) {
          const sourceRequest = requestsById.get(sourceId);
          if (sourceRequest?.__recordId) {
            await client.records.changeRequest({
              recordId: sourceRequest.__recordId,
              operation: "delete",
              deleteMode: "archive",
              message: `Merged into ${targetId}`,
              submittedBy: "kelly-feedback-executor",
            });
          }
        }
        if (target) {
          const history = parseJsonList(target.decision_history);
          history.push({
            at: now,
            actor: "kelly",
            action: "updated",
            note: `Approved proposal ${proposal.proposal_id}: merged ${(op.request_ids || []).filter((id) => id !== targetId).join(", ")}.`,
          });
          await updateRow(
            client,
            target,
            {
              request_id: target.request_id,
              title: target.title || "",
              product: target.product || "",
              status: target.status || "candidate",
              trend: target.trend || "flat",
              effort_estimate: target.effort_estimate || "",
              problem_statement: target.problem_statement || "",
              spec_summary: target.spec_summary || "",
              representative_feedback_ids: target.representative_feedback_ids || "[]",
              decision_history: JSON.stringify(history),
              created_at: target.created_at || now,
              updated_at: now,
            },
            `Mark ${targetId} merged`,
          );
        }
        entry.status = "executed";
        executedCount += 1;
      } else {
        entry.status = "handoff_ready";
        handoffCount += 1;
      }
      results.push(entry);
    }

    if (apply) {
      await updateRow(
        client,
        proposal,
        {
          proposal_id: proposal.proposal_id,
          type: proposal.type || "promote_request",
          title: proposal.title || "",
          status: "done",
          request_id: proposal.request_id || "",
          request_ids: proposal.request_ids || "[]",
          target_lane: proposal.target_lane || "",
          reason: proposal.reason || "",
          evidence: proposal.evidence || "",
          draft_kind: proposal.draft_kind || "",
          draft: proposal.draft || "",
          review_note: proposal.review_note || "",
          created_at: proposal.created_at || "",
          decided_at: proposal.decided_at || now,
        },
        `Mark proposal ${proposal.proposal_id} done`,
      );
    }
  }

  if (apply) {
    await createRow(
      client,
      declared("sync_log"),
      {
        sync_id: `execute-${Date.now()}`,
        at: now,
        actor: "kelly-feedback",
        action: "execute",
        detail: `Executed ${executedCount} local operation(s); ${handoffCount} handoff(s) ready for the agent.`,
        count: executedCount + handoffCount,
      },
      "Execute run log",
    );
  }

  for (const result of results) {
    console.log(
      `${result.proposal_id}: ${result.status} ${result.operation}${result.reason ? ` (${result.reason})` : ""}`,
    );
  }
  console.log(
    `${apply ? "Applied" : "Dry run:"} ${approvedCount} approved proposal(s), ${results.length} operation(s) (${executedCount} local, ${handoffCount} handoff-ready, ${skippedCount} skipped).`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to apply local roadmap/merge operations.");
  else
    console.log(
      "Local roadmap/merge operations applied. Outbound operations (changelog/decline reply) are handoff_ready only — deliver them via kelly-messenger/kelly-email/docs edits, never this script.",
    );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
