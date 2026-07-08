#!/usr/bin/env node
// Dry-run-by-default execution stub: turns approved proposals into concrete operations
// in execution_report.json. No external side effects — the agent performs the handoffs
// (kelly-listing brief, sourcing brief export, watch entries) after reading the report.
// Usage: node scripts/execute_decisions.ts [--apply]
import path from "node:path";
import { applyDecisions } from "../app/server/decisions.ts";
import { EXECUTION_REPORT_PATH, SKILL_DIR, SNAPSHOT_PATH } from "../app/server/paths.ts";
import {
  acquireLock,
  computeMetrics,
  emptySnapshot,
  readDecisions,
  readJson,
  releaseLock,
  writeJson,
} from "../app/server/store.ts";
import type { PicksSnapshot } from "../app/server/types.ts";

const apply = process.argv.includes("--apply");
const now = new Date().toISOString();
const exportsDir = path.join(SKILL_DIR, "exports");

await acquireLock(
  "kelly-picks/execute_decisions",
  apply ? "Applying approved decisions" : "Dry-run of approved decisions",
);
try {
  const raw: PicksSnapshot = (await readJson<PicksSnapshot>(SNAPSHOT_PATH, null)) || emptySnapshot();
  const decisions = await readDecisions();
  const snapshot = applyDecisions(raw, decisions);
  const candidatesById = new Map(snapshot.candidates.map((item) => [item.candidate_id, item]));
  const operations: Array<Record<string, unknown>> = [];

  for (const proposal of snapshot.proposals || []) {
    if (proposal.status !== "approved") continue;
    const candidate = candidatesById.get(proposal.candidate_id);
    const note = proposal.review?.comment || "";
    const verdict = String(proposal.verdict || "");
    if (verdict === "develop") {
      operations.push({
        id: proposal.proposal_id,
        kind: "proposal",
        operation: "create_sourcing_brief",
        target: path.join(exportsDir, `sourcing-brief-${proposal.candidate_id}.md`),
        summary: `Export sourcing brief for ${candidate?.name || proposal.candidate_id}`,
        note,
        dry_run: !apply,
        status: apply ? "executed" : "planned",
      });
      operations.push({
        id: proposal.proposal_id,
        kind: "proposal",
        operation: "handoff_listing_brief",
        target: "kelly-listing",
        summary: `Hand off listing brief for ${candidate?.name || proposal.candidate_id} to kelly-listing`,
        note,
        dry_run: !apply,
        status: apply ? "executed" : "planned",
      });
    } else if (verdict === "watch") {
      operations.push({
        id: proposal.proposal_id,
        kind: "proposal",
        operation: "add_watch",
        target: proposal.candidate_id,
        summary: `Keep watching ${candidate?.name || proposal.candidate_id} — re-check criteria: ${firstLine(proposal.brief)}`,
        note,
        dry_run: !apply,
        status: apply ? "executed" : "planned",
      });
    } else if (verdict === "drop") {
      operations.push({
        id: proposal.proposal_id,
        kind: "proposal",
        operation: "drop_candidate",
        target: proposal.candidate_id,
        summary: `Archive ${candidate?.name || proposal.candidate_id} — ${firstLine(proposal.reason)}`,
        note,
        dry_run: !apply,
        status: apply ? "executed" : "planned",
      });
    }
  }

  const report = {
    generated_at: now,
    source: "kelly-picks",
    dry_run: !apply,
    operation_count: operations.length,
    operations,
  };
  await writeJson(EXECUTION_REPORT_PATH, report);

  if (apply && operations.length) {
    const doneProposalIds = new Set(operations.map((op) => op.id));
    raw.proposals = (raw.proposals || []).map((proposal) =>
      doneProposalIds.has(proposal.proposal_id) ? { ...proposal, status: "done" } : proposal,
    );
    const stageByCandidate = new Map<unknown, string>();
    for (const op of operations) {
      if (op.operation === "add_watch") stageByCandidate.set(op.target, "watch");
      if (op.operation === "drop_candidate") stageByCandidate.set(op.target, "dropped");
      if (op.operation === "handoff_listing_brief") {
        const proposal = (raw.proposals || []).find((entry) => entry.proposal_id === op.id);
        if (proposal) stageByCandidate.set(proposal.candidate_id, "develop");
      }
    }
    raw.candidates = (raw.candidates || []).map((candidate) =>
      stageByCandidate.has(candidate.candidate_id)
        ? { ...candidate, stage: stageByCandidate.get(candidate.candidate_id), last_updated: now }
        : candidate,
    );
    raw.generated_at = now;
    raw.metrics = { ...raw.metrics, ...computeMetrics(raw) };
    raw.sync_log = raw.sync_log || [];
    raw.sync_log.unshift({
      at: now,
      actor: "kelly-picks-agent",
      action: "execute_decisions",
      detail: `${operations.length} approved operations recorded as executed handoffs.`,
    });
    raw.sync_log = raw.sync_log.slice(0, 50);
    await writeJson(SNAPSHOT_PATH, raw);
  }

  console.log(`${apply ? "APPLIED" : "DRY-RUN"}: ${operations.length} operations → ${EXECUTION_REPORT_PATH}`);
  for (const op of operations) {
    console.log(`- ${op.operation} → ${op.target || "(no target)"} :: ${op.summary}`);
  }
  if (!apply) console.log("No changes applied. Re-run with --apply after the handoffs are performed.");
} finally {
  await releaseLock();
}

function firstLine(text: unknown): string {
  return (
    String(text || "")
      .split("\n")
      .find((line) => line.trim()) || ""
  );
}
