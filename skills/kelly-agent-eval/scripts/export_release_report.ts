#!/usr/bin/env node
import path from "node:path";
import type { EvalRun, ReleaseDecision } from "../app/server/types.ts";
// Merges the eval run + reviewer decisions + release verdict into one
// release_report.json handoff file — the record a release owner can attach to
// a release ticket. Refuses to run if a blocking regression has no decision
// yet, or if no release decision has been recorded.
import { readJson, withLock, writeJson } from "../lib/common.ts";
import { computeMetrics } from "../lib/eval-data.ts";
import { DATA_DIR, DECISIONS_PATH, EVAL_RUN_PATH, RELEASE_DECISION_PATH } from "../lib/paths.ts";

type DecisionsFile = Record<string, { action: string; note: string; decided_at: string }>;

async function main(): Promise<void> {
  await withLock("kelly-agent-eval", "Exporting release report", async () => {
    const run = await readJson<EvalRun>(EVAL_RUN_PATH, null);
    if (!run) {
      console.error("No eval run found. Run scripts/generate_eval_run.ts first.");
      process.exitCode = 1;
      return;
    }
    const decisions = (await readJson<DecisionsFile>(DECISIONS_PATH, {})) || {};
    const release = await readJson<ReleaseDecision>(RELEASE_DECISION_PATH, null);

    const cases = run.cases.map((item) => {
      const decision = decisions[item.id];
      return decision
        ? {
            ...item,
            status: "done" as const,
            decision: {
              action: decision.action as "mark_blocking" | "mark_acceptable",
              note: decision.note,
              decided_at: decision.decided_at,
            },
          }
        : item;
    });
    const metrics = computeMetrics(cases);

    const undecidedRegressions = cases.filter((c) => c.regression && !c.decision);
    if (undecidedRegressions.length) {
      console.error(
        `Refusing to export: ${undecidedRegressions.length} regression(s) have no reviewer decision yet: ${undecidedRegressions.map((c) => c.id).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }
    if (!release) {
      console.error("Refusing to export: no release decision recorded yet (approve_release / block_release).");
      process.exitCode = 1;
      return;
    }

    const report = {
      run_id: run.run_id,
      exported_at: new Date().toISOString(),
      baseline_version: run.baseline_version,
      candidate_version: run.candidate_version,
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
    const outPath = path.join(DATA_DIR, "release_report.json");
    await writeJson(outPath, report);
    console.log(`Wrote release report to ${outPath} — decision: ${release.decision}`);
  });
}

await main();
