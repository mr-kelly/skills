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
  const generatedAt = Date.parse(snapshot.generated_at || "") || 0;

  for (const item of snapshot.items) {
    const decision = decisions.decisions[item.id];
    if (!decision) continue;
    const nextStatus = statusFromDecision(decision.action);
    if (!nextStatus) continue;
    if (item.status === "done") continue;
    // Freshness gate: a decision decided before the current snapshot was
    // generated refers to an earlier version of this item's content (e.g. a
    // re-import overwrote it after the decision was recorded) and must not be
    // treated as authorizing what is in the snapshot now. Mirrors app.js's
    // effectiveItem() staleness handling.
    const decidedAt = Date.parse(decision.decided_at || "") || 0;
    if (decidedAt < generatedAt) {
      results.push({
        item_id: item.id,
        ref: item.ref,
        operation: "none",
        dry_run: !apply,
        from_status: item.status,
        to_status: item.status,
        comment: decision.comment || "",
        reason: "Approval decision predates the current snapshot (stale approval); refusing to execute.",
      });
      continue;
    }
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
