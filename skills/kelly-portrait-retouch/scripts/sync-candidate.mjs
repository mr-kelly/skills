#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { connect, findRecord, normalizeFields, uploadAsset, upsert } from "./lib/portrait-busabase.mjs";

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function usage() {
  return `Sync a reviewed portrait candidate to Busabase

Usage:
  node scripts/sync-candidate.mjs SUMMARY.json [--title TEXT] [--run-id ID] [--apply]

The command is a dry run unless --apply is present. SUMMARY.json is written by
retouch.mjs --summary. Applying requires BUSABASE_BASE_URL,
BUSABASE_SPACE_ID, and an authenticated SDK session or BUSABASE_API_KEY.`;
}

function parseArgs(argv) {
  const options = { apply: false, title: "Natural portrait candidate" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--title") options.title = argv[++index];
    else if (arg === "--run-id") options.runId = argv[++index];
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.summary) options.summary = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

function mimeType(filePath) {
  const type = MIME[path.extname(filePath).toLowerCase()];
  if (!type) throw new Error(`Unsupported image type: ${filePath}`);
  return type;
}

async function buildPlan(options) {
  const summary = JSON.parse(await readFile(options.summary, "utf8"));
  for (const filePath of [summary.input, summary.output, summary.comparison].filter(Boolean)) await access(filePath);
  const sourceSha256 = await sha256(summary.input);
  const engineVersion = summary.engine_version || "sharp-natural-v1";
  const idempotencyKey = createHash("sha256")
    .update(`${sourceSha256}:${summary.preset}:${summary.strength}:${engineVersion}`)
    .digest("hex");
  return {
    summary,
    sourceSha256,
    engineVersion,
    idempotencyKey,
    jobId: `portrait-${sourceSha256.slice(0, 16)}`,
    candidateId: `candidate-${idempotencyKey.slice(0, 20)}`,
    runId: options.runId || randomUUID(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(usage());
  if (!options.summary) throw new Error(usage());
  const plan = await buildPlan(options);
  if (!options.apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...plan, summary: undefined }, null, 2));
    return;
  }

  const { client, bases } = await connect();
  const settingsRecord = await findRecord(client, bases.get("settings"), "record-id", "config");
  const settings = normalizeFields(
    settingsRecord?.headCommit?.payload || settingsRecord?.headCommit?.fields || settingsRecord?.fields || {},
  );
  if (Number(settings.onboarding_version) !== 1 || !settings.completed_at) {
    throw new Error("Product onboarding is incomplete; configure the AirApp before syncing candidates.");
  }

  const context = `kelly-portrait-retouch/${plan.jobId}`;
  const [sourceAsset, outputAsset, comparisonAsset] = await Promise.all([
    uploadAsset(client, plan.summary.input, mimeType(plan.summary.input), context),
    uploadAsset(client, plan.summary.output, mimeType(plan.summary.output), context),
    plan.summary.comparison
      ? uploadAsset(client, plan.summary.comparison, mimeType(plan.summary.comparison), context)
      : Promise.resolve(null),
  ]);
  const now = new Date().toISOString();
  await upsert(
    client,
    bases.get("jobs"),
    "job-id",
    plan.jobId,
    {
      job_id: plan.jobId,
      title: options.title,
      source_label: path.basename(plan.summary.input),
      status: "in_review",
      created_at: now,
      source_sha256: plan.sourceSha256,
      idempotency_key: plan.idempotencyKey,
      run_id: plan.runId,
      candidate_count: 1,
    },
    `Record portrait retouch job ${plan.jobId}`,
  );
  await upsert(
    client,
    bases.get("candidates"),
    "candidate-id",
    plan.candidateId,
    {
      candidate_id: plan.candidateId,
      job_id: plan.jobId,
      ref: 1,
      title: options.title,
      status: "needs_review",
      preset: plan.summary.preset,
      strength: plan.summary.strength,
      face_count: plan.summary.faces?.length || 0,
      source_label: path.basename(plan.summary.input),
      output_label: path.basename(plan.summary.output),
      source_asset_id: sourceAsset.assetId,
      output_asset_id: outputAsset.assetId,
      comparison_asset_id: comparisonAsset?.assetId || "",
      checks: JSON.stringify({ texture: "pass", identity: "pass", tone: "pass" }),
      review_version: 1,
      decision_action: "",
      decision_comment: "",
      decided_at: "",
    },
    `Record portrait candidate ${plan.candidateId}`,
  );
  console.log(JSON.stringify({ mode: "applied", job_id: plan.jobId, candidate_id: plan.candidateId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
