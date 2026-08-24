#!/usr/bin/env node
// Trusted export step. Kelly Agent Eval's AirApp only ever writes a human
// verdict (mark_blocking/mark_acceptable per case, approve/block for the
// release) onto Busabase records — the browser cannot write to the local
// filesystem, and this skill never deploys or publishes anything (see
// SKILL.md's boundary). This script is the process authorized to package the
// decided run into a release_report.json handoff file: it re-reads Busabase,
// applies the exact same refusal rules as the retired
// scripts/export_release_report.ts (refuses if a regression has no decision
// yet, or no release decision has been recorded, or the release_policy
// blocks an "approve" while a regression is still "blocking"), and writes the
// same report shape (run_id/exported_at/baseline_version/candidate_version/
// metrics/release_decision/cases) to a local output path. It never writes
// back to Busabase.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-agent-eval-app/app/js/config.js";
import {
  buildConfigSummary,
  buildReleaseDecision,
  computeCase,
  computeMetrics,
  evaluateReleaseGate,
} from "../content/kelly-agent-eval-app/app/js/eval-model.js";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_release_report.mjs [--apply] [--out <dir>]

Reads the current run's cases and the release decision from Busabase. Without
--apply this is a dry run that only prints the report that would be written.
With --apply it writes release_report.json to <out> (default: exports/ at the
skill root). Refuses to run if a regression still has no decision, if no
release decision exists, or if release_policy.blocking_regression_blocks_release
is true and the release is "approve" while a regression is still "blocking".
Never writes back to Busabase.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

async function readAll(client, declared) {
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
      rows.push(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const outIndex = argv.indexOf("--out");
  const outRoot = path.resolve(outIndex >= 0 ? argv[outIndex + 1] : path.join(SKILL_DIR, "exports"));

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

  const [caseRows, settingsRows] = await Promise.all([readAll(client, casesBase), readAll(client, settingsBase)]);
  if (!caseRows.length) {
    console.error("No eval run found. Run scripts/generate_eval_run.mjs --apply first.");
    process.exitCode = 1;
    return;
  }

  const cases = caseRows.map(computeCase);
  const metrics = computeMetrics(cases);
  const release = buildReleaseDecision(settingsRows);
  const configSummary = buildConfigSummary(settingsRows);

  const gate = evaluateReleaseGate({
    cases,
    release,
    blockingRegressionBlocksRelease: configSummary.release_policy.blocking_regression_blocks_release,
  });
  if (!gate.ok) {
    console.error(`Refusing to export: ${gate.reason}`);
    process.exitCode = 1;
    return;
  }

  const report = {
    run_id: configSummary.run_id,
    exported_at: new Date().toISOString(),
    baseline_version: configSummary.baseline_version,
    candidate_version: configSummary.candidate_version,
    metrics,
    release_decision: release,
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      regression: c.regression,
      decision: c.decision || null,
    })),
  };

  console.log(JSON.stringify({ dry_run: !apply, output: path.join(outRoot, "release_report.json"), report }, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write release_report.json.");
    return;
  }

  await fs.mkdir(outRoot, { recursive: true });
  const outPath = path.join(outRoot, "release_report.json");
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote release report to ${outPath} — decision: ${release.decision}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
