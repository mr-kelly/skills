#!/usr/bin/env node
import {
  acquireLock,
  readDecisions,
  readSnapshot,
  releaseLock,
  statusFromDecision,
  writeExecutionReport,
  writeSnapshot,
} from "../lib/common.ts";
import { APP_ID, EXECUTE_OPERATION, type ExecutionReport } from "../lib/types.ts";

const apply = process.argv.includes("--apply");

await acquireLock(apply ? "Applying approved decisions" : "Dry-running approved decisions");
try {
  const snapshot = await readSnapshot();
  const decisions = await readDecisions();
  const now = new Date().toISOString();
  const results: Record<string, unknown>[] = [];

  for (const item of snapshot.items) {
    const decision = decisions.decisions[item.id];
    if (!decision) continue;
    const nextStatus = statusFromDecision(decision.action);
    if (!nextStatus) continue;
    const result = {
      item_id: item.id,
      ref: item.ref,
      operation: decision.action === "approve" ? EXECUTE_OPERATION : decision.action,
      dry_run: !apply,
      from_status: item.status,
      to_status: decision.action === "approve" ? "done" : nextStatus,
      comment: decision.comment || "",
    };
    results.push(result);
    if (apply) {
      item.review_note = decision.comment || item.review_note;
      if (typeof decision.draft === "string") item.draft = decision.draft;
      if (decision.fields) item.fields = { ...(item.fields || {}), ...decision.fields };
      item.status = decision.action === "approve" ? "done" : nextStatus;
      item.decided_at = decision.decided_at;
    }
  }

  const report: ExecutionReport = {
    schema_version: "1",
    executed_at: now,
    dry_run: !apply,
    source: APP_ID,
    results,
  };
  await writeExecutionReport(report);
  if (apply) {
    snapshot.activity_log.push({
      at: now,
      actor: APP_ID,
      action: "execute_decisions",
      detail: `Applied ${results.length} reviewer decisions.`,
      count: results.length,
    });
    await writeSnapshot(snapshot);
  }
  console.log(`${apply ? "Applied" : "Dry-run"} ${results.length} decisions for Legal Firm Radar`);
} finally {
  await releaseLock();
}
