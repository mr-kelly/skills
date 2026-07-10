#!/usr/bin/env node
// Executor: re-reads decisions.json against current_batch.json and writes an
// execution_report.json noting which items are settled (verified/flagged) vs
// still pending a human decision. There is no external side effect here — this
// tracker never files anything; "execution" only means writing the local
// handoff report that a human or downstream skill can consume.

import { EXECUTION_REPORT_PATH, LOCK_PATH } from "../app/server/paths.ts";
import { applyDecisions, ensureDirs, readBatch, readDecisions, writeJson } from "../app/server/store.ts";
import type { ExecutionReport } from "../app/server/types.ts";

async function main(): Promise<void> {
  await ensureDirs();
  const batch = await readBatch();
  const decisions = await readDecisions();
  const resolved = applyDecisions(batch, decisions);

  await writeJson(LOCK_PATH, {
    owner: "kelly-disclosure-tracker",
    message: "Writing execution report",
    started_at: new Date().toISOString(),
  });

  try {
    const report: ExecutionReport = {
      generated_at: new Date().toISOString(),
      results: resolved.items.map((item) => ({
        item_id: item.id,
        // "written" means settled: verified (done) or flagged (blocked, escalated).
        // "changes_requested" items are still waiting on a source document and
        // must not be reported as written even though a decision exists.
        status: item.status === "done" || item.status === "blocked" ? "written" : "skipped",
        detail:
          item.status === "needs_review"
            ? "No reviewer decision yet."
            : item.status === "changes_requested"
              ? `Awaiting source document (${item.decision?.action ?? "n/a"}); not yet settled.`
              : `Recorded as ${item.status} (${item.decision?.action ?? "n/a"}).`,
      })),
    };
    await writeJson(EXECUTION_REPORT_PATH, report);
    const written = report.results.filter((r) => r.status === "written").length;
    console.log(`Wrote ${EXECUTION_REPORT_PATH} (${written}/${report.results.length} items settled)`);
  } finally {
    const fs = await import("node:fs/promises");
    await fs.rm(LOCK_PATH, { force: true });
  }
}

await main();
