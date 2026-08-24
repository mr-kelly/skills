#!/usr/bin/env node
// Trusted hand-off step. Kelly Deal Scorer's AirApp only ever proposes an
// approve/send-back/reject verdict on a candidate record; this script is the
// process authorized to act on an "approve_term_sheet" verdict. It performs
// NO external side effect (no wiring transfers, no signing, no contacting
// the business) — "execution" here means marking a term-sheet draft as
// prepared locally at the composite score's suggested revenue-share rate,
// which is itself the reviewable artifact the human just approved. It
// re-reads Busabase, marks each approved candidate's status "done", and
// reports what still needs no action.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-deal-scorer-app/app/js/config.js";
import { computeScore, rubricFromConfig } from "../content/kelly-deal-scorer-app/app/js/scorer-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads candidates with status "approved" (decision_action
"approve_term_sheet") from Busabase. Without --apply this is a dry run that
only prints what would be executed. With --apply it writes status "done"
back onto each approved candidate — it still performs no external send, wire,
or signature; "execution" only means preparing the local term-sheet draft
artifact at the suggested revenue-share rate.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonArray(value = "[]") {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    throw new Error("Kelly Deal Scorer Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const candidatesBase = resources.bases.find((base) => base.key === "candidates");
  const settingsBase = resources.bases.find((base) => base.key === "settings");
  const [page, settingsPage] = await Promise.all([
    client.records.list({ baseId: candidatesBase.baseId, limit: candidatesBase.readLimit }),
    client.records.list({ baseId: settingsBase.baseId, limit: settingsBase.readLimit }),
  ]);
  const records = Array.isArray(page) ? page : page.records || [];
  const settingsRecords = Array.isArray(settingsPage) ? settingsPage : settingsPage.records || [];
  const configRow = settingsRecords
    .map((record) => normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields))
    .find((row) => row.kind === "config");
  let config = {};
  try {
    config = configRow?.payload ? JSON.parse(configRow.payload) : {};
  } catch {
    config = {};
  }
  const rubric = rubricFromConfig(config);

  const results = [];
  for (const record of records) {
    const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
    if (fields.status === "approved") {
      const score = computeScore(
        {
          category: fields.category,
          requested_principal: Number(fields.requested_principal) || 0,
          monthly_revenue: parseJsonArray(fields.monthly_revenue).map(Number),
        },
        rubric,
      );
      results.push({
        candidate_id: fields.candidate_id,
        business_name: fields.business_name,
        operation: "prepare_term_sheet_draft",
        status: apply ? "executed" : "dry_run",
        reason: `Composite score ${score.composite_score} approved for term sheet at ${score.suggested_share_rate.min_pct}-${score.suggested_share_rate.max_pct}% revenue share.`,
        executed_at: new Date().toISOString(),
      });
      if (apply) {
        await client.records.changeRequest({
          recordId: record.id,
          operation: "update",
          fields: toBusabaseFields({ ...fields, status: "done" }),
          message: `Execute approved decision for candidate ${fields.candidate_id}`,
          author: "kelly-deal-scorer-executor",
          baseCommitId: record.headCommitId || record.headCommit?.id,
          autoMerge: true,
        });
      }
    } else if (fields.status === "blocked") {
      results.push({
        candidate_id: fields.candidate_id,
        business_name: fields.business_name,
        operation: "close_candidate",
        status: "blocked",
        reason: fields.decision_comment || "Rejected by reviewer.",
        executed_at: new Date().toISOString(),
      });
    } else {
      results.push({
        candidate_id: fields.candidate_id,
        business_name: fields.business_name,
        operation: "no_action",
        status: "skipped",
        reason: `Still ${fields.status}; no decision to execute.`,
        executed_at: new Date().toISOString(),
      });
    }
  }

  console.log(JSON.stringify({ executed_at: new Date().toISOString(), dry_run: !apply, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
