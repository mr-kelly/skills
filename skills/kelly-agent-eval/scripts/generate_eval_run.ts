#!/usr/bin/env node
import path from "node:path";
import type { Config } from "../app/server/types.ts";
// Generates the fixed mock eval run (~18 cases, baseline vs candidate,
// deterministic rubric scores) into app/.data/eval_run.json, and clears prior
// decisions/release verdict so a fresh run starts clean for review.
import { readJson, withLock, writeJson } from "../lib/common.ts";
import { buildEvalRun } from "../lib/eval-data.ts";
import { DECISIONS_PATH, EVAL_RUN_PATH, RELEASE_DECISION_PATH, SKILL_DIR } from "../lib/paths.ts";

async function loadVersions(): Promise<{ baseline: string; candidate: string }> {
  const config = await readJson<Config>(path.join(SKILL_DIR, "config.local.json"), null);
  const example = config ? null : await readJson<Config>(path.join(SKILL_DIR, "config.example.json"), null);
  const cfg = config || example || {};
  return {
    baseline: cfg.baseline_version || "v2.4.0 (baseline)",
    candidate: cfg.candidate_version || "v2.5.0-rc1 (candidate)",
  };
}

async function main(): Promise<void> {
  await withLock("kelly-agent-eval", "Generating eval run", async () => {
    const { baseline, candidate } = await loadVersions();
    const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const run = buildEvalRun(runId, new Date().toISOString(), baseline, candidate);
    await writeJson(EVAL_RUN_PATH, run);
    await writeJson(DECISIONS_PATH, {});
    await writeJson(RELEASE_DECISION_PATH, null);
    console.log(`Wrote ${run.cases.length} cases to ${EVAL_RUN_PATH}`);
    console.log(
      `Baseline pass rate: ${run.metrics.baseline_pass_rate}% · Candidate pass rate: ${run.metrics.candidate_pass_rate}% · Regressions: ${run.metrics.regressions}`,
    );
  });
}

await main();
