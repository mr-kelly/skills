#!/usr/bin/env node
// Trusted seed step. Generates the fixed deterministic mock session sample
// (100 sessions across 5 segments — NOT real user data, NOT a real ML/LLM
// call) and writes it into the Busabase `sessions` Base, ensures a `segments`
// row exists for every segment (without touching any decision already
// recorded on it — regenerating the dataset never resets a human review
// verdict, mirroring the retired scripts/generate_batch.ts's decisions.json
// behavior of only creating an empty file when one doesn't exist yet), and
// (re)writes the `settings` "config" row (product profile / target
// precision / seed).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import {
  DEFAULT_DATASET_SEED,
  SEGMENTS,
  generateAllSessions,
} from "../content/kelly-behavior-predict-app/app/js/behavior-model.js";
import { appConfig } from "../content/kelly-behavior-predict-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/generate_batch.mjs [--apply] [options]

Without --apply this is a dry run that only prints what would be written.
With --apply it writes the fixed 100-session mock sample to the Busabase
"sessions" Base, ensures a "segments" row exists for every segment (leaving
any existing decision alone), and refreshes the "settings" "config" row.

Options:
  --seed <text>                Dataset seed (default: keep existing, else the built-in default)
  --product-name <name>        Product profile name (default: keep existing, else "Example Booking Co.")
  --vertical <text>            Product profile vertical (default: keep existing, else "consumer travel/booking")
  --target-precision <number>  Informational target precision, 0-1 (default: keep existing, else 0.6)`);
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

async function upsert(client, declared, idFieldSlug, idValue, existingRows, fields, message) {
  const existing = existingRows.find((row) => row[idFieldSlug.replaceAll("-", "_")] === idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-behavior-predict-generator",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-behavior-predict-generator",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--seed") args.seed = argv[++i];
    else if (arg === "--product-name") args.productName = argv[++i];
    else if (arg === "--vertical") args.vertical = argv[++i];
    else if (arg === "--target-precision") args.targetPrecision = Number(argv[++i]);
  }
  return args;
}

function parseJsonPayload(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
    throw new Error("Kelly Behavior Predict Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const sessionsBase = resources.bases.find((base) => base.key === "sessions");
  const segmentsBase = resources.bases.find((base) => base.key === "segments");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  const [existingSessions, existingSegments, existingSettings] = await Promise.all([
    readAll(client, sessionsBase),
    readAll(client, segmentsBase),
    readAll(client, settingsBase),
  ]);

  const existingConfig = parseJsonPayload(existingSettings.find((row) => row.kind === "config")?.payload);
  const seed = args.seed || existingConfig.seed || DEFAULT_DATASET_SEED;
  const config = {
    seed,
    product_name: args.productName || existingConfig.product_name || "Example Booking Co.",
    vertical: args.vertical || existingConfig.vertical || "consumer travel/booking",
    target_precision: Number.isFinite(args.targetPrecision)
      ? args.targetPrecision
      : (existingConfig.target_precision ?? 0.6),
  };

  const sessions = generateAllSessions(seed);
  const now = new Date().toISOString();

  console.log(
    JSON.stringify(
      {
        dry_run: !args.apply,
        seed,
        config,
        segments: SEGMENTS.length,
        sessions: sessions.length,
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write the sample to Busabase.");
    return;
  }

  await Promise.all(
    sessions.map((session) =>
      upsert(
        client,
        sessionsBase,
        "session-id",
        session.session_id,
        existingSessions,
        {
          session_id: session.session_id,
          segment_id: session.segment_id,
          session_length: session.session_length,
          cart_abandon_count: session.cart_abandon_count,
          price_check_count: session.price_check_count,
          days_since_last_visit: session.days_since_last_visit,
          coupon_clicks: session.coupon_clicks,
          reached_stage: session.reached_stage,
          actual_action: session.actual_action,
        },
        `Generate mock sample (seed=${seed}): session ${session.session_id}`,
      ),
    ),
  );

  // Ensure a `segments` row exists for every segment, but never touch an
  // already-recorded decision — regenerating the dataset must not silently
  // reset a human review verdict.
  await Promise.all(
    SEGMENTS.map((segment) => {
      if (existingSegments.some((row) => row.segment_id === segment.id)) return null;
      return upsert(
        client,
        segmentsBase,
        "segment-id",
        segment.id,
        existingSegments,
        { segment_id: segment.id, decision_status: "", decision_note: "", decided_at: "" },
        `Generate mock sample (seed=${seed}): ensure segment row ${segment.id}`,
      );
    }),
  );

  await upsert(
    client,
    settingsBase,
    "record-id",
    "config",
    existingSettings,
    { record_id: "config", kind: "config", payload: JSON.stringify(config), updated_at: now },
    `Generate mock sample (seed=${seed}): config`,
  );

  console.log(`Wrote ${sessions.length} sessions across ${SEGMENTS.length} segments to Busabase (seed="${seed}").`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
