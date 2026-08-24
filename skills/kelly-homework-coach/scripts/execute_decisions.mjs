#!/usr/bin/env node
// Trusted hand-off step. Kelly Homework Coach's AirApp only ever records a
// parent/teacher's decision (approve / request_changes / block) on a review
// item (a question explanation, a mistake card, or a paper plan) — it never
// exports a paper, sends anything to a school system, or contacts a
// teacher itself. This mirrors the retired scripts/execute_decisions.ts
// exactly: for an approved item it reports the local-only operation the
// agent should perform next (add_to_mistake_book / mark_understood /
// queue_practice_paper / export_paper_plan / request_revision / no_action,
// picked from the review's own proposed_action) and, once it *has* actually
// happened, marks the review "done"; it never invents a new automated
// action beyond what the retired script already reported. There is no
// separate execution_report.json bucket in the Busabase-only shape — the
// report is written directly onto each review's own execution-* fields,
// matching the execution-marker pattern used by kelly-finance/
// kelly-disclosure-tracker/kelly-deal-scorer.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the settled/pending report for every review.
//   node scripts/execute_decisions.mjs --apply       Write execution-status/execution-detail/executed-at (and, for
//                                                     approve/block, the review's own final status) onto every
//                                                     decided review. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-homework-coach-app/app/js/config.js";
import { baseReviewFields, computeReviewFromRow } from "../content/kelly-homework-coach-app/app/js/homework-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Re-reads every review from Busabase and reports, per decided review, the
local-only operation the agent should perform next ("written") or why it is
still pending ("skipped" — not yet decided, or a request_changes review
still waiting on a redraft). Without --apply this is a dry run that only
prints the report. With --apply it writes an execution marker
(execution-status, execution-detail, executed-at) back onto every decided
review, and for approve/block also sets the review's own final status
(done/blocked) — it performs no export, filing, or external transmission,
and never touches the linked question/mistake/paper record.`);
}

// Ported verbatim from operationFor() in the retired scripts/execute_decisions.ts.
function operationFor(item) {
  if (item.proposed_action === "add_to_mistake_book") return "add_to_mistake_book";
  if (item.proposed_action === "export_paper_plan") return "export_paper_plan";
  if (item.proposed_action === "generate_practice") return "queue_practice_paper";
  if (item.proposed_action === "mark_understood") return "mark_understood";
  if (item.proposed_action === "revise_explanation") return "request_revision";
  return "no_action";
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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
    throw new Error("Kelly Homework Coach Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const reviewsBase = resources.bases.find((base) => base.key === "reviews");
  const rows = await readAll(client, reviewsBase);

  const now = new Date().toISOString();
  const results = [];
  for (const row of rows) {
    const review = computeReviewFromRow(row);
    if (!review.decision) continue; // Not yet decided by a parent/teacher.

    if (review.decision.action === "approve") {
      const operation = operationFor(review);
      const status = apply ? "executed" : "planned";
      const detail = `Ready for agent: ${operation} (target ${review.target_type}:${review.target_id}).`;
      results.push({
        review_id: review.review_id,
        ref: review.ref,
        target_id: review.target_id,
        operation,
        status,
        dry_run: !apply,
      });
      if (apply) {
        await client.records.changeRequest({
          recordId: row.__recordId,
          operation: "update",
          fields: toBusabaseFields(
            baseReviewFields({
              ...review,
              status: "done",
              execution_status: status,
              execution_detail: detail,
              executed_at: now,
            }),
          ),
          message: `Record execution report for review ${review.review_id}: ${status}`,
          author: "kelly-homework-coach-executor",
          baseCommitId: row.__headCommitId,
          autoMerge: true,
        });
      }
      continue;
    }

    if (review.decision.action === "request_changes") {
      // A "task" for the agent is just this review's own changes_requested
      // status (see pendingAgentTasks() in homework-model.js) — nothing to
      // write here, only report.
      const queued = review.status === "changes_requested";
      results.push({
        review_id: review.review_id,
        ref: review.ref,
        target_id: review.target_id,
        operation: "request_revision",
        status: queued ? "queued" : "blocked",
        dry_run: !apply,
        reason: queued
          ? "Agent task is queued."
          : "No pending changes_requested status found; re-submit request_changes from the app.",
      });
      continue;
    }

    if (review.decision.action === "block") {
      const status = apply ? "executed" : "planned";
      const detail = review.decision.comment || "Reviewer blocked the item.";
      results.push({
        review_id: review.review_id,
        ref: review.ref,
        target_id: review.target_id,
        operation: "block_item",
        status,
        dry_run: !apply,
        reason: detail,
      });
      if (apply) {
        await client.records.changeRequest({
          recordId: row.__recordId,
          operation: "update",
          fields: toBusabaseFields(
            baseReviewFields({
              ...review,
              status: "blocked",
              execution_status: status,
              execution_detail: detail,
              executed_at: now,
            }),
          ),
          message: `Record execution report for review ${review.review_id}: ${status}`,
          author: "kelly-homework-coach-executor",
          baseCommitId: row.__headCommitId,
          autoMerge: true,
        });
      }
    }
  }

  const written = results.filter((r) => r.status === "executed" || r.status === "planned").length;
  console.log(JSON.stringify({ generated_at: now, dry_run: !apply, results }, null, 2));
  console.log(`${written}/${results.length} decided reviews reported.`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to record execution markers on each decided review.");
  } else {
    console.log(
      "Recorded execution markers on every decided review. No external side effects either way — this script never exports, files, or sends anything.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
