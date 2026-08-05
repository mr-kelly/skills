#!/usr/bin/env node
// Trusted seed step. Writes the fixed 8-candidate mock queue (ported verbatim
// from the retired lib/demo-candidates.ts, now living in
// app/app/js/scorer-model.js's CANDIDATE_SEEDS) into the Busabase
// `candidates` Base, scoring each with the same deterministic rubric the
// live app uses, and resets every candidate's decision fields so a fresh
// queue starts clean for review. Also (re)writes the `settings` Base's `run`
// row (batch id + generated-at) and, on first run only, seeds a `config` row
// with the default rubric so it can be tuned per fund policy later. Ported
// from the retired scripts/generate_batch.ts, which wrote the same shape to
// app/.data/current_batch.json.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { CANDIDATE_SEEDS, DEFAULT_RUBRIC, computeScore } from "../app/app/js/scorer-model.js";

function help() {
  console.log(`Usage: node scripts/generate_batch.mjs [--apply]

Without --apply this is a dry run that only prints what would be written.
With --apply it writes the fixed 8-candidate mock queue to the Busabase
"candidates" Base (resetting every candidate's decision fields to
"needs_review") and refreshes the "run" settings row. Seeds a default
"config" settings row only if none exists yet.`);
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

async function upsert(client, declared, idFieldSlug, idValue, existingRows, fields, message) {
  const existing = existingRows.find((row) => row[idFieldSlug.replaceAll("-", "_")] === idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-deal-scorer-generator",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-deal-scorer-generator",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const args = parseArgs(argv);

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

  const [existingCandidates, existingSettings] = await Promise.all([
    readAll(client, candidatesBase),
    readAll(client, settingsBase),
  ]);

  const batchId = `kelly-deal-scorer-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
  const generatedAt = new Date().toISOString();

  const computed = CANDIDATE_SEEDS.map((seed) => ({ seed, score: computeScore(seed, DEFAULT_RUBRIC) }));
  const scores = computed.map(({ score }) => score.composite_score);
  const high = scores.filter((s) => s >= DEFAULT_RUBRIC.decision_thresholds.high_confidence_min).length;
  const low = scores.filter((s) => s < DEFAULT_RUBRIC.decision_thresholds.needs_review_min).length;
  const review = scores.length - high - low;

  console.log(
    JSON.stringify(
      {
        generated_at: generatedAt,
        batch_id: batchId,
        dry_run: !args.apply,
        candidates: CANDIDATE_SEEDS.length,
        distribution: { high_confidence: high, needs_review: review, low_confidence: low },
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write the batch to Busabase.");
    return;
  }

  await Promise.all(
    computed.map(({ seed }) =>
      upsert(
        client,
        candidatesBase,
        "candidate-id",
        seed.id,
        existingCandidates,
        {
          candidate_id: seed.id,
          business_name: seed.business_name,
          category: seed.category,
          city: seed.city,
          requested_principal: seed.requested_principal,
          monthly_revenue: JSON.stringify(seed.monthly_revenue),
          red_flags: JSON.stringify(seed.red_flags),
          status: "needs_review",
          decision_action: "",
          decision_comment: "",
          decided_at: "",
        },
        `Generate batch ${batchId}: seed candidate ${seed.id}`,
      ),
    ),
  );

  await upsert(
    client,
    settingsBase,
    "record-id",
    "run",
    existingSettings,
    {
      record_id: "run",
      kind: "run",
      payload: JSON.stringify({ batch_id: batchId, generated_at: generatedAt }),
      updated_at: generatedAt,
    },
    `Generate batch ${batchId}: run metadata`,
  );

  const hasConfigRow = existingSettings.some((row) => row.kind === "config");
  if (!hasConfigRow) {
    await upsert(
      client,
      settingsBase,
      "record-id",
      "config",
      existingSettings,
      {
        record_id: "config",
        kind: "config",
        payload: JSON.stringify({ base_currency: "USD", rubric: DEFAULT_RUBRIC }),
        updated_at: generatedAt,
      },
      `Generate batch ${batchId}: seed default rubric config`,
    );
  }

  console.log(`Wrote ${CANDIDATE_SEEDS.length} candidates to Busabase for batch ${batchId}.`);
  console.log(
    `High-confidence: ${high} · Needs review: ${review} · Low-confidence: ${low} (thresholds ${DEFAULT_RUBRIC.decision_thresholds.high_confidence_min}/${DEFAULT_RUBRIC.decision_thresholds.needs_review_min})`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
