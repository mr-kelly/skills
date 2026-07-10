#!/usr/bin/env node
import type { Batch } from "../app/server/types.ts";
// Thin CLI: re-read decisions and "execute" the approved ones by writing a
// per-item execution result to app/.data/execution_report.json. This app has
// no external side effects (no wiring transfers or emails) — "execution" here
// means marking a term sheet as prepared locally, which is itself the
// reviewable artifact the human just approved.
import { readJson, withLock, writeJson } from "../lib/common.ts";
import { BATCH_PATH, EXECUTION_REPORT_PATH } from "../lib/paths.ts";

interface ExecutionEntry {
  id: string;
  business_name: string;
  operation: string;
  status: "executed" | "blocked" | "skipped";
  reason: string;
  executed_at: string;
}

await withLock("kelly-deal-scorer", "Executing approved decisions", async () => {
  const batch = await readJson<Batch>(BATCH_PATH, null);
  if (!batch) {
    console.error(`No batch found at ${BATCH_PATH}. Run scripts/generate_batch.ts first.`);
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  const results: ExecutionEntry[] = [];

  for (const item of batch.items) {
    if (item.status === "approved") {
      results.push({
        id: item.id,
        business_name: item.business_name,
        operation: "prepare_term_sheet_draft",
        status: "executed",
        reason: `Composite score ${item.score.composite_score} approved for term sheet at ${item.score.suggested_share_rate.min_pct}-${item.score.suggested_share_rate.max_pct}% revenue share.`,
        executed_at: now,
      });
      item.status = "done";
    } else if (item.status === "blocked") {
      results.push({
        id: item.id,
        business_name: item.business_name,
        operation: "close_candidate",
        status: "blocked",
        reason: item.decision?.comment || "Rejected by reviewer.",
        executed_at: now,
      });
    } else {
      results.push({
        id: item.id,
        business_name: item.business_name,
        operation: "no_action",
        status: "skipped",
        reason: `Still ${item.status}; no decision to execute.`,
        executed_at: now,
      });
    }
  }

  await writeJson(BATCH_PATH, batch);
  await writeJson(EXECUTION_REPORT_PATH, { generated_at: now, results });
  console.log(`Wrote ${EXECUTION_REPORT_PATH} (${results.length} entries).`);
});
