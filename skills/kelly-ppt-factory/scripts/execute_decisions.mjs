#!/usr/bin/env node
// Trusted hand-off step. Kelly PPT Factory's AirApp only ever proposes a
// review decision on a slide card or deck (approve / request changes /
// block / revise); this script is the process authorized to act on that
// decision. It performs NO PPTX generation and NO file writes of its own —
// it only ever records a planned operation ("planned"/"ready_for_agent")
// directly onto the decided row and NEVER flips workflow `status` itself
// (the decision write already did that via
// content/kelly-ppt-factory-app/app/js/providers/busabase-provider.js's decideItem()), matching
// kelly-legal-precedent-desk's, kelly-legal-casebase-ingest's, and
// kelly-legal-firm-radar's execute_decisions.mjs precedent. The retired
// scripts/execute_decisions.ts only ever wrote a local
// execution_report.json summary and likewise never touched workflow
// status; this script keeps that same safety boundary, now writing the
// summary directly onto each decided Busabase row instead of a local file.
// The real follow-up for an approved deck — generating the PPTX — is a
// separate, explicit step: scripts/generate_pptx.mjs.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every decided row.
//   node scripts/execute_decisions.mjs --apply       Write execution-status="ready_for_agent" onto each
//                                                     decided row. Still no PPTX generation, no file writes.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-ppt-factory-app/app/js/config.js";
import {
  baseDeckFields,
  baseSlideFields,
  itemExecution,
  normalizeDeckRow,
  normalizeSlideRow,
} from "../content/kelly-ppt-factory-app/app/js/ppt-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads slide cards and decks with a recorded decision_action
(approve/request_changes/block/revise) from Busabase. Without --apply this
is a dry run that only prints the planned follow-up operation for each. With
--apply it writes an execution marker (execution-status: "ready_for_agent",
operation, target, detail) back onto each decided row — it performs no PPTX
generation and never changes the row's workflow status. Generating an
approved deck's PPTX is a separate step: scripts/generate_pptx.mjs.`);
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
    throw new Error("Kelly PPT Factory Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const decksBase = resources.bases.find((base) => base.key === "decks");
  const slideCardsBase = resources.bases.find((base) => base.key === "slide-cards");

  const [deckRows, slideRows] = await Promise.all([readAll(client, decksBase), readAll(client, slideCardsBase)]);
  const decidedDecks = deckRows.filter((row) => row.decision_action);
  const decidedSlides = slideRows.filter((row) => row.decision_action);

  if (!decidedDecks.length && !decidedSlides.length) {
    console.log("No decided slide cards or decks to execute. Nothing written.");
    return;
  }

  const now = new Date().toISOString();

  for (const row of decidedDecks) {
    const deck = normalizeDeckRow(row);
    const execution = itemExecution(deck, "deck", row.decision_action, { apply });
    console.log(`  deck ${deck.ref} (${deck.deck_id}) -> ${execution.operation} (${execution.status})`);
    console.log(`    ${execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseDeckFields(deck),
          execution_status: execution.status,
          execution_operation: execution.operation,
          execution_target: execution.target,
          execution_detail: execution.detail,
          executed_at: now,
        }),
        message: `Record execution plan for deck ${deck.deck_id}: ${execution.operation}`,
        author: "kelly-ppt-factory-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  for (const row of decidedSlides) {
    const slide = normalizeSlideRow(row);
    const execution = itemExecution(slide, "slide", row.decision_action, { apply });
    console.log(`  slide ${slide.ref} (${slide.slide_id}) -> ${execution.operation} (${execution.status})`);
    console.log(`    ${execution.detail}`);
    if (apply) {
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseSlideFields(slide),
          execution_status: execution.status,
          execution_operation: execution.operation,
          execution_target: execution.target,
          execution_detail: execution.detail,
          executed_at: now,
        }),
        message: `Record execution plan for slide card ${slide.slide_id}: ${execution.operation}`,
        author: "kelly-ppt-factory-execute-decisions",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (!apply) {
    console.log(
      `Dry run only (${decidedDecks.length + decidedSlides.length} row(s)). Re-run with --apply to record execution markers.`,
    );
    return;
  }
  console.log(
    "Recorded execution markers on each decided row. No PPTX was generated — run scripts/generate_pptx.mjs for an approved deck.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
