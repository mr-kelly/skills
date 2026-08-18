#!/usr/bin/env node
// Trusted hand-off step. Kelly Products's AirApp only ever records a review
// decision on a review item (approve / request_changes / block); this script
// is the process authorized to act on that decision. It performs NO external
// side effects itself -- it never publishes a channel listing, changes a
// price, or archives a SKU. This mirrors the retired app's Boundary section
// exactly: publishing channels, changing prices, archiving SKUs, and lifting
// quality holds all require a human approval record, then the agent executes
// the approved operation outside the app and records the outcome.
//
// reviewExecution is ported/adapted from the retired app's Workflow step 5
// ("execute only approved operations, record concrete results in
// execution_report.json"): one execution marker directly on the review
// item's own record instead of a separate execution_report.json list.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every decided review item.
//   node scripts/execute_decisions.mjs --apply       Write execution-status="ready_for_agent" onto each
//                                                     decided review item. Still no external side effects.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { normalizeProductRow, reviewExecution, reviewToFields } from "../app/app/js/products-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads review items with a recorded decision (status approved/changes_requested/
blocked) and no execution marker yet from Busabase. Without --apply this is a
dry run that only prints the planned follow-up operation (publish_channel /
apply_price_change / lift_quality_hold / maintain_quality_hold /
maintain_block / archive_product / request_revision) for each. With --apply
it writes an execution marker (execution-status: "ready_for_agent", detail)
back onto each review item -- it performs no publish, no price change, no
archive itself. The agent performs the real follow-up outside the app after
this report (per SKILL.md's Boundary), then can re-run this script to mark
new decisions.`);
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

const STATUS_TO_ACTION = { approved: "approve", changes_requested: "request_changes", blocked: "block" };

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
    throw new Error("Kelly Products Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "review");
  const productsDeclared = resources.bases.find((base) => base.key === "products");

  const [rows, productRows] = await Promise.all([readAll(client, declared), readAll(client, productsDeclared)]);
  const productsById = new Map(productRows.map((row) => [row.product_id, normalizeProductRow(row)]));
  const decided = rows.filter((row) => STATUS_TO_ACTION[row.status] && !row.execution_status);

  if (!decided.length) {
    console.log("No newly-decided review items to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of decided) {
    const item = {
      item_id: row.item_id,
      product_id: row.product_id,
      type: row.type,
      recommendation: row.recommendation,
    };
    const decision = { action: STATUS_TO_ACTION[row.status] };
    const productName = productsById.get(row.product_id)?.name || row.product_id;
    const execution = reviewExecution(item, decision, productName, { apply });
    if (!execution) continue;
    console.log(
      `  Review #${row.ref} (${row.item_id}) -> ${execution.operation} (${execution.status}) target=${execution.target}`,
    );
    console.log(`    ${execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...reviewToFields(row),
          execution_status: execution.status,
          execution_detail: execution.detail,
          executed_at: now,
        }),
        message: `Record execution plan for ${row.item_id}: ${execution.operation}`,
        author: "kelly-products-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(`Dry run only (${decided.length} review item(s)). Re-run with --apply to record execution markers.`);
    return;
  }
  console.log(
    "Recorded execution markers on each decided review item. No external side effects either way -- the agent performs the real follow-up (publish/price change/archive) outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
