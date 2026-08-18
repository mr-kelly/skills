#!/usr/bin/env node
// Trusted hand-off step. Kelly Listing's AirApp only ever proposes a review
// decision on a draft (approve / request changes / block / revise); this
// script is the process authorized to act on that decision. It performs NO
// external side effects — it never uploads a flat file, publishes via a
// platform API, or files anything itself. This mirrors the retired
// scripts/execute_decisions.ts exactly: it only ever recorded planned
// operations ("planned"/"ready_for_agent") and NEVER flipped a draft's
// workflow `status` itself — the real follow-up (export the Markdown/CSV
// listing via scripts/export_listings.mjs, then publish via the platform
// API through the user or a separate approved connector) is performed by
// the agent OUTSIDE the app only after explicit human approval, matching
// SKILL.md's Boundary section.
//
// draftExecution is ported/adapted from the retired scripts/execute_decisions.ts
// (app/app/js/listing-model.js's doc comment explains the adaptation: one
// execution marker directly on the draft record instead of a separate
// execution_report.json list, folding the retired "publish_via_api" entry's
// detail into the same "export_listing" marker).
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every decided draft.
//   node scripts/execute_decisions.mjs --apply       Write execution-status="ready_for_agent" onto each
//                                                     approved/changes-requested draft. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { draftExecution, normalizeProductRow } from "../app/app/js/listing-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads drafts with decision-action "approve" or "request_changes" from
Busabase. Without --apply this is a dry run that only prints the planned
follow-up operation (export_listing / request_revision) for each. With
--apply it writes an execution marker (execution-status: "ready_for_agent",
operation, target, detail) back onto each draft — it performs no export, no
platform API publish, no filing itself, and never changes the draft's
workflow status. The agent performs the real follow-up outside the app after
this report (scripts/export_listings.mjs, then publish through an approved
channel per SKILL.md), then records the real result on the draft.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseDraftFields(row) {
  return {
    draft_id: row.draft_id,
    ref: row.ref,
    product_id: row.product_id,
    platform: row.platform,
    locale: row.locale || "",
    variant_group: row.variant_group || "",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    keyword_strategy: row.keyword_strategy || "",
    title: row.title || "",
    subtitle: row.subtitle || "",
    bullets: row.bullets || "[]",
    description: row.description || "",
    search_terms: row.search_terms || "",
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    selling_points: row.selling_points || "[]",
    aplus_outline: row.aplus_outline || "[]",
    item_specifics: row.item_specifics || "[]",
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "[]",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

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
    throw new Error("Kelly Listing Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "drafts");
  const productsDeclared = resources.bases.find((base) => base.key === "products");

  const [rows, productRows] = await Promise.all([readAll(client, declared), readAll(client, productsDeclared)]);
  const productsById = new Map(productRows.map((row) => [row.product_id, normalizeProductRow(row)]));
  const decided = rows.filter((row) => row.decision_action === "approve" || row.decision_action === "request_changes");

  if (!decided.length) {
    console.log("No approved or changes-requested drafts to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of decided) {
    const draft = { draft_id: row.draft_id, platform: row.platform, locale: row.locale };
    const decision = { action: row.decision_action };
    const productName = productsById.get(row.product_id)?.name || row.product_id;
    const execution = draftExecution(draft, decision, productName, { apply });
    if (!execution) continue;
    console.log(
      `  Draft #${row.ref} (${row.draft_id}) -> ${execution.operation} (${execution.status}) target=${execution.target}`,
    );
    console.log(`    ${execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseDraftFields(row),
          execution_status: execution.status,
          execution_operation: execution.operation,
          execution_target: execution.target,
          execution_detail: execution.detail,
          executed_at: now,
          // Workflow status is deliberately left unchanged — the agent's real
          // follow-up outside the app, not this script, ultimately resolves
          // the draft (see SKILL.md's Boundary section).
        }),
        message: `Record execution plan for ${row.draft_id}: ${execution.operation}`,
        author: "kelly-listing-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(`Dry run only (${decided.length} draft(s)). Re-run with --apply to record execution markers.`);
    return;
  }
  console.log(
    "Recorded execution markers on each decided draft. No external side effects either way — the agent performs the real follow-up outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
