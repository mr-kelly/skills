#!/usr/bin/env node
// Trusted seed step. Generates the fixed mock eval run (~18 cases, baseline
// vs candidate, deterministic rubric scores — NOT a real LLM-judge call) and
// writes it into the Busabase `cases` Base, resetting every case's decision
// fields so a fresh run starts clean for review. Also (re)writes the
// `settings` rows for `run` metadata and `config` (team/version/policy), and
// clears any prior `release` verdict. Ported from the retired
// scripts/generate_eval_run.ts, which wrote the same shape to
// app/.data/eval_run.json/decisions.json/release_decision.json.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { RAW_CASES, computeMetrics, toRun } from "../app/app/js/eval-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/generate_eval_run.mjs [--apply] [options]

Without --apply this is a dry run that only prints what would be written.
With --apply it writes the fixed 18-case mock suite to the Busabase "cases"
Base (resetting every case's decision fields), refreshes the "run" and
"config" settings rows, and clears any prior "release" verdict.

Options:
  --team <name>              Team name (default: keep existing, else "Agent Eval Team")
  --baseline <label>         Baseline version label (default: keep existing, else "v2.4.0 (baseline)")
  --candidate <label>        Candidate version label (default: keep existing, else "v2.5.0-rc1 (candidate)")
  --min-pass-rate <number>   Minimum candidate pass rate policy (default: keep existing, else 80)
  --allow-blocking-release   Set release_policy.blocking_regression_blocks_release=false (default: keep existing, else true)`);
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
      submittedBy: "kelly-agent-eval-generator",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-agent-eval-generator",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--team") args.team = argv[++i];
    else if (arg === "--baseline") args.baseline = argv[++i];
    else if (arg === "--candidate") args.candidate = argv[++i];
    else if (arg === "--min-pass-rate") args.minPassRate = Number(argv[++i]);
    else if (arg === "--allow-blocking-release") args.allowBlockingRelease = true;
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
    throw new Error("Kelly Agent Eval Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const casesBase = resources.bases.find((base) => base.key === "cases");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  const [existingCases, existingSettings] = await Promise.all([
    readAll(client, casesBase),
    readAll(client, settingsBase),
  ]);

  const existingConfig = parseJsonPayload(existingSettings.find((row) => row.kind === "config")?.payload);
  const existingReleaseRow = existingSettings.find((row) => row.kind === "release");

  const config = {
    team_name: args.team || existingConfig.team_name || "Agent Eval Team",
    baseline_version: args.baseline || existingConfig.baseline_version || "v2.4.0 (baseline)",
    candidate_version: args.candidate || existingConfig.candidate_version || "v2.5.0-rc1 (candidate)",
    release_policy: {
      blocking_regression_blocks_release: args.allowBlockingRelease
        ? false
        : (existingConfig.release_policy?.blocking_regression_blocks_release ?? true),
      min_candidate_pass_rate: Number.isFinite(args.minPassRate)
        ? args.minPassRate
        : (existingConfig.release_policy?.min_candidate_pass_rate ?? 80),
    },
  };

  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const generatedAt = new Date().toISOString();

  const computed = RAW_CASES.map((raw) => ({
    raw,
    baseline: toRun(raw.baselineTranscript, raw.baselineScores),
    candidate: toRun(raw.candidateTranscript, raw.candidateScores),
  }));
  const previewCases = computed.map(({ raw, baseline, candidate }) => {
    const regression = candidate.overall < baseline.overall - 3 || (baseline.pass && !candidate.pass);
    const improvement = !regression && candidate.overall > baseline.overall + 3;
    return { id: raw.id, baseline, candidate, regression, improvement, decision: null };
  });
  const metrics = computeMetrics(previewCases);

  console.log(
    JSON.stringify(
      {
        generated_at: generatedAt,
        run_id: runId,
        dry_run: !args.apply,
        config,
        cases: RAW_CASES.length,
        metrics,
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write the run to Busabase.");
    return;
  }

  const now = generatedAt;
  await Promise.all(
    computed.map(({ raw }) =>
      upsert(
        client,
        casesBase,
        "case-id",
        raw.id,
        existingCases,
        {
          case_id: raw.id,
          title: raw.title,
          category: raw.category,
          prompt: raw.prompt,
          baseline_transcript: raw.baselineTranscript,
          baseline_helpfulness: raw.baselineScores.helpfulness,
          baseline_correctness: raw.baselineScores.correctness,
          baseline_safety: raw.baselineScores.safety,
          baseline_tone: raw.baselineScores.tone,
          candidate_transcript: raw.candidateTranscript,
          candidate_helpfulness: raw.candidateScores.helpfulness,
          candidate_correctness: raw.candidateScores.correctness,
          candidate_safety: raw.candidateScores.safety,
          candidate_tone: raw.candidateScores.tone,
          decision_action: "",
          decision_note: "",
          decided_at: "",
        },
        `Generate eval run ${runId}: seed case ${raw.id}`,
      ),
    ),
  );

  await upsert(
    client,
    settingsBase,
    "record-id",
    "run",
    existingSettings,
    { record_id: "run", kind: "run", payload: JSON.stringify({ run_id: runId, generated_at: now }), updated_at: now },
    `Generate eval run ${runId}: run metadata`,
  );
  await upsert(
    client,
    settingsBase,
    "record-id",
    "config",
    existingSettings,
    { record_id: "config", kind: "config", payload: JSON.stringify(config), updated_at: now },
    `Generate eval run ${runId}: config`,
  );
  if (existingReleaseRow) {
    await upsert(
      client,
      settingsBase,
      "record-id",
      "release",
      existingSettings,
      { record_id: "release", kind: "release", payload: "", updated_at: now },
      `Generate eval run ${runId}: clear prior release decision`,
    );
  }

  console.log(`Wrote ${RAW_CASES.length} cases to Busabase for run ${runId}.`);
  console.log(
    `Baseline pass rate: ${metrics.baseline_pass_rate}% · Candidate pass rate: ${metrics.candidate_pass_rate}% · Regressions: ${metrics.regressions}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
