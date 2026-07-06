#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved proposals (snapshot status
// or decisions.json verdicts) and writes execution_report.json describing the
// concrete operations the agent would perform. No external side effects ever:
// outbound replies and changelog publishing are handed off to the agent, which
// executes them via kelly-messenger / kelly-email / docs edits after approval.
//
// Usage:
//   node scripts/execute_decisions.mjs           # dry run, report only
//   node scripts/execute_decisions.mjs --apply   # also apply local roadmap/status changes
import { emptyDecisions, recomputeDerived } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const apply = process.argv.includes("--apply");

function fail(message) {
  console.error(`Execute decisions failed: ${message}`);
  process.exit(1);
}

function effectiveStatus(proposal, decisions) {
  const decision = decisions.proposals?.[proposal.proposal_id];
  if (!decision) return { status: proposal.status, decision: null };
  const statusByAction = { approve: "approved", request_changes: "changes_requested", block: "blocked" };
  return { status: statusByAction[decision.action] || proposal.status, decision };
}

function operationsFor(proposal, decision) {
  const draft = typeof decision?.draft === "string" ? decision.draft : proposal.draft;
  if (proposal.type === "promote_request") {
    return [
      {
        operation: "update_roadmap",
        target_lane: proposal.target_lane || "next",
        request_id: proposal.request_id,
      },
      ...(draft
        ? [
            {
              operation: "publish_changelog_note",
              draft_id: proposal.proposal_id,
              draft,
            },
          ]
        : []),
    ];
  }
  if (proposal.type === "decline_request") {
    return [
      {
        operation: "send_decline_reply",
        handoff: "kelly-messenger/kelly-email",
        draft_id: proposal.proposal_id,
        request_id: proposal.request_id,
        draft,
      },
    ];
  }
  if (proposal.type === "merge_requests") {
    return [
      {
        operation: "merge_requests",
        request_id: proposal.request_id,
        request_ids: proposal.request_ids || [],
      },
    ];
  }
  if (proposal.type === "publish_changelog") {
    return [
      {
        operation: "publish_changelog_note",
        draft_id: proposal.proposal_id,
        request_id: proposal.request_id,
        draft,
      },
    ];
  }
  return [{ operation: "unknown", reason: `unsupported proposal type: ${proposal.type}` }];
}

const LOCAL_OPERATIONS = new Set(["update_roadmap", "merge_requests"]);

const provider = await createProvider();
await provider
  .acquireLock(apply ? "Executing approved roadmap decisions" : "Dry-run of roadmap decisions")
  .catch((error) => fail(error.message));
try {
  const snapshot = await provider.readSnapshot();
  if (!snapshot) fail("no snapshot found");
  const decisions = (await provider.readDecisions()) || emptyDecisions();
  const now = new Date().toISOString();
  const report = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-feedback",
    dry_run: !apply,
    operations: [],
    summary: { approved: 0, executed: 0, handoff_ready: 0, skipped: 0 },
  };
  const agentTasks = (await provider.readAgentTasks()) || { schema_version: "1", updated_at: "", tasks: [] };

  for (const proposal of snapshot.proposals || []) {
    const { status, decision } = effectiveStatus(proposal, decisions);
    if (status === "done") {
      report.operations.push({
        proposal_id: proposal.proposal_id,
        ref: proposal.ref,
        operation: "no_op",
        status: "skipped",
        reason: "already done",
      });
      report.summary.skipped += 1;
      continue;
    }
    if (status === "changes_requested") {
      report.operations.push({
        proposal_id: proposal.proposal_id,
        ref: proposal.ref,
        operation: "revise_proposal",
        status: "skipped",
        reason: "queued for agent revision",
        note: decision?.review_note || proposal.review_note || "",
      });
      report.summary.skipped += 1;
      if (
        apply &&
        !agentTasks.tasks.some((task) => task.proposal_id === proposal.proposal_id && task.status === "queued")
      ) {
        agentTasks.tasks.push({
          task_id: `task-${Date.now()}-${agentTasks.tasks.length + 1}`,
          type: "revise_proposal",
          proposal_id: proposal.proposal_id,
          note: decision?.review_note || proposal.review_note || "",
          status: "queued",
          created_at: now,
        });
      }
      continue;
    }
    if (status !== "approved") {
      report.operations.push({
        proposal_id: proposal.proposal_id,
        ref: proposal.ref,
        operation: "no_op",
        status: "skipped",
        reason: `status is ${status}`,
      });
      report.summary.skipped += 1;
      continue;
    }

    report.summary.approved += 1;
    for (const op of operationsFor(proposal, decision)) {
      const entry = { proposal_id: proposal.proposal_id, ref: proposal.ref, status: "planned", ...op };
      if (!apply) {
        report.operations.push(entry);
        continue;
      }
      if (LOCAL_OPERATIONS.has(op.operation)) {
        applyLocalOperation(snapshot, proposal, op, now);
        entry.status = "executed";
        report.summary.executed += 1;
      } else {
        entry.status = "handoff_ready";
        report.summary.handoff_ready += 1;
      }
      report.operations.push(entry);
    }
    if (apply) {
      proposal.status = "done";
      proposal.decided_at = proposal.decided_at || now;
      if (decision?.review_note) proposal.review_note = decision.review_note;
      if (typeof decision?.draft === "string") proposal.draft = decision.draft;
    }
  }

  if (apply) {
    snapshot.generated_at = now;
    snapshot.sync_log.push({
      at: now,
      actor: "kelly-feedback",
      action: "execute",
      detail: `Executed ${report.summary.executed} local operation(s); ${report.summary.handoff_ready} handoff(s) ready for the agent.`,
      count: report.summary.executed + report.summary.handoff_ready,
    });
    recomputeDerived(snapshot);
    await provider.writeSnapshot(snapshot);
    agentTasks.updated_at = now;
    await provider.writeAgentTasks(agentTasks);
  }
  await provider.writeExecutionReport(report);
  console.log(
    `${apply ? "Applied" : "Dry run:"} ${report.summary.approved} approved proposal(s), ${report.operations.length} operation(s).`,
  );
  console.log(`Wrote execution report via "${provider.kind}" provider.`);
} finally {
  await provider.releaseLock();
}

function applyLocalOperation(snapshot, proposal, op, now) {
  if (op.operation === "update_roadmap") {
    const request = snapshot.requests.find((item) => item.request_id === op.request_id);
    const lane = snapshot.roadmap[op.target_lane] || (snapshot.roadmap[op.target_lane] = []);
    if (!lane.some((item) => item.request_id === op.request_id)) {
      lane.push({
        item_id: `rm-${op.target_lane}-${op.request_id}`,
        title: request?.title || op.request_id,
        request_id: op.request_id,
        note: `Promoted via proposal #${proposal.ref}.`,
      });
    }
    if (request) {
      request.status = "roadmap";
      request.updated_at = now;
      request.decision_history.push({
        at: now,
        actor: "kelly",
        action: "promoted",
        note: `Approved proposal #${proposal.ref}: moved to ${op.target_lane}.`,
      });
    }
    return;
  }
  if (op.operation === "merge_requests") {
    const targetId = op.request_id;
    const target = snapshot.requests.find((item) => item.request_id === targetId);
    for (const sourceId of op.request_ids.filter((id) => id !== targetId)) {
      for (const item of snapshot.feedback) {
        if (item.request_id === sourceId) item.request_id = targetId;
      }
      const index = snapshot.requests.findIndex((item) => item.request_id === sourceId);
      if (index >= 0) snapshot.requests.splice(index, 1);
    }
    if (target) {
      target.updated_at = now;
      target.decision_history.push({
        at: now,
        actor: "kelly",
        action: "updated",
        note: `Approved proposal #${proposal.ref}: merged ${op.request_ids.filter((id) => id !== targetId).join(", ")}.`,
      });
    }
  }
}
