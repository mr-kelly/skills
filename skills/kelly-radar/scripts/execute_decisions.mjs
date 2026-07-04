#!/usr/bin/env node
import { applyDecisions } from "../app/server/decisions.mjs";
// Dry-run-by-default execution stub: turns approved items into concrete operations
// in execution_report.json. No external side effects — handoffs are performed by the
// agent (kelly-writer / kelly-feedback / watchlist config) after reading the report.
// Usage: node scripts/execute_decisions.mjs [--apply]
import { EXECUTION_REPORT_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { acquireLock, emptySnapshot, readDecisions, readJson, releaseLock, writeJson } from "../app/server/store.mjs";

const apply = process.argv.includes("--apply");
const now = new Date().toISOString();

await acquireLock(
  "kelly-radar/execute_decisions",
  apply ? "Applying approved decisions" : "Dry-run of approved decisions",
);
try {
  const raw = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  const decisions = await readDecisions();
  const snapshot = applyDecisions(raw, decisions);
  const operations = [];

  for (const signal of snapshot.signals || []) {
    if (signal.status !== "approved") continue;
    const handoff = signal.handoff || { operation: "start_research", target: "", summary: "" };
    operations.push({
      id: signal.signal_id,
      kind: "signal",
      operation: handoff.operation,
      target: handoff.target || "",
      summary: handoff.summary || signal.headline,
      note: signal.triage?.comment || "",
      dry_run: !apply,
      status: apply ? "executed" : "planned",
    });
  }

  for (const brief of snapshot.research?.briefs || []) {
    if (brief.status !== "approved") continue;
    const question = (snapshot.research?.questions || []).find((entry) => entry.brief_id === brief.brief_id);
    if (!question || !["brief_needs_review", "researching"].includes(question.status)) continue;
    operations.push({
      id: brief.brief_id,
      kind: "brief",
      operation: "start_research",
      target: question.question_id,
      summary: `Run approved brief for: ${question.question}`,
      note: brief.triage?.comment || "",
      dry_run: !apply,
      status: apply ? "executed" : "planned",
    });
  }

  for (const opportunity of snapshot.trends?.opportunities || []) {
    if (opportunity.status !== "approved") continue;
    const step = opportunity.proposed_next_step || {};
    operations.push({
      id: opportunity.opportunity_id,
      kind: "opportunity",
      operation: step.operation || "handoff_content_brief",
      target: step.target || "",
      summary: step.summary || opportunity.title,
      note: opportunity.triage?.comment || "",
      dry_run: !apply,
      status: apply ? "executed" : "planned",
    });
  }

  const report = {
    generated_at: now,
    source: "kelly-radar",
    dry_run: !apply,
    operation_count: operations.length,
    operations,
  };
  await writeJson(EXECUTION_REPORT_PATH, report);

  if (apply && operations.length) {
    const doneSignalIds = new Set(operations.filter((op) => op.kind === "signal").map((op) => op.id));
    const doneOpportunityIds = new Set(operations.filter((op) => op.kind === "opportunity").map((op) => op.id));
    raw.signals = (raw.signals || []).map((signal) =>
      doneSignalIds.has(signal.signal_id) ? { ...signal, status: "done" } : signal,
    );
    raw.trends = raw.trends || { movers: [], opportunities: [] };
    raw.trends.opportunities = (raw.trends.opportunities || []).map((item) =>
      doneOpportunityIds.has(item.opportunity_id) ? { ...item, status: "done" } : item,
    );
    raw.generated_at = now;
    raw.sync_log = raw.sync_log || [];
    raw.sync_log.unshift({
      at: now,
      actor: "kelly-radar-agent",
      action: "execute_decisions",
      detail: `${operations.length} approved operations recorded as executed handoffs.`,
    });
    raw.sync_log = raw.sync_log.slice(0, 50);
    await writeJson(SNAPSHOT_PATH, raw);
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"}: ${operations.length} operations → ${EXECUTION_REPORT_PATH}`);
  for (const op of operations) {
    console.log(`- [${op.kind}] ${op.operation} → ${op.target || "(no target)"} :: ${op.summary}`);
  }
  if (!apply) console.log("No changes applied. Re-run with --apply to mark handoffs executed.");
} finally {
  await releaseLock();
}
