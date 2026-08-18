#!/usr/bin/env node
// Dry-run-by-default execution stub, ported from the retired
// scripts/execute_decisions.ts. Turns APPROVED proposals into concrete
// operations the agent must perform outside the app — a sourcing brief
// export, a listing-brief handoff to kelly-listing, or a watch/drop stage
// update. No external side effects: this script never writes an export
// file and never invokes kelly-listing itself; it only prints the plan
// (default) or, with --apply, marks the proposal `done` and updates the
// candidate's stage after the agent has actually performed the handoff.
//
// Usage:
//   node scripts/execute_decisions.mjs            Dry-run: print the plan for every approved proposal.
//   node scripts/execute_decisions.mjs --apply     After the agent has performed the handoffs, mark the
//                                                    approved proposals done and update candidate stages.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
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
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

function firstLine(text) {
  return (
    String(text || "")
      .split("\n")
      .find((line) => line.trim()) || ""
  );
}

// Ported verbatim from the retired scripts/execute_decisions.ts: maps an
// approved proposal's verdict to its concrete outside-the-app operation(s).
function operationsFor(proposal, candidateName) {
  const note = proposal.review_comment || "";
  if (proposal.verdict === "develop") {
    return [
      {
        operation: "create_sourcing_brief",
        target: `exports/sourcing-brief-${proposal.candidate_id}.md`,
        summary: `Export sourcing brief for ${candidateName || proposal.candidate_id}`,
        note,
      },
      {
        operation: "handoff_listing_brief",
        target: "kelly-listing",
        summary: `Hand off listing brief for ${candidateName || proposal.candidate_id} to kelly-listing`,
        note,
      },
    ];
  }
  if (proposal.verdict === "watch") {
    return [
      {
        operation: "add_watch",
        target: proposal.candidate_id,
        summary: `Keep watching ${candidateName || proposal.candidate_id} — re-check criteria: ${firstLine(proposal.brief)}`,
        note,
      },
    ];
  }
  if (proposal.verdict === "drop") {
    return [
      {
        operation: "drop_candidate",
        target: proposal.candidate_id,
        summary: `Archive ${candidateName || proposal.candidate_id} — ${firstLine(proposal.reason)}`,
        note,
      },
    ];
  }
  return [];
}

function stageForVerdict(verdict) {
  if (verdict === "develop") return "develop";
  if (verdict === "watch") return "watch";
  if (verdict === "drop") return "dropped";
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Picks Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [candidates, proposals] = await Promise.all([
    readAll(client, declared("candidates")),
    readAll(client, declared("proposals")),
  ]);
  const candidateById = new Map(candidates.map((item) => [item.candidate_id, item]));

  const approved = proposals.filter((proposal) => proposal.status === "approved");
  if (!approved.length) {
    console.log("No approved proposals to plan. Approve proposals in the app first.");
    return;
  }

  const now = new Date().toISOString();
  let operationCount = 0;
  for (const proposal of approved) {
    const candidate = candidateById.get(proposal.candidate_id);
    const operations = operationsFor(proposal, candidate?.name);
    operationCount += operations.length;
    for (const op of operations) {
      console.log(`- ${op.operation} → ${op.target} :: ${op.summary}`);
    }

    if (apply && operations.length) {
      const { __recordId, __headCommitId, ...proposalFields } = proposal;
      await client.records.changeRequest({
        recordId: __recordId,
        operation: "update",
        fields: toBusabaseFields({ ...proposalFields, status: "done" }),
        message: `Mark proposal ${proposal.proposal_id} done`,
        author: "kelly-picks-execute-decisions",
        baseCommitId: __headCommitId,
        autoMerge: true,
      });

      const stage = stageForVerdict(proposal.verdict);
      if (stage && candidate) {
        const { __recordId: candidateRecordId, __headCommitId: candidateHeadCommitId, ...candidateFields } = candidate;
        await client.records.changeRequest({
          recordId: candidateRecordId,
          operation: "update",
          fields: toBusabaseFields({ ...candidateFields, stage, last_updated: now }),
          message: `Stage candidate ${candidate.candidate_id} → ${stage}`,
          author: "kelly-picks-execute-decisions",
          baseCommitId: candidateHeadCommitId,
          autoMerge: true,
        });
      }
    }
  }

  if (apply) {
    await client.bases.createChangeRequest({
      baseId: declared("sync_log").baseId,
      fields: toBusabaseFields({
        log_id: `log-${Date.now().toString(36)}`,
        at: now,
        actor: "kelly-picks-agent",
        action: "execute_decisions",
        detail: `${approved.length} approved proposals → ${operationCount} operations recorded as executed handoffs.`,
      }),
      message: "Execute decisions sync log",
      submittedBy: "kelly-picks-execute-decisions",
      autoMerge: true,
    });
  }

  console.log(
    `${apply ? "APPLIED" : "DRY-RUN"}: ${approved.length} approved proposal(s) → ${operationCount} operation(s).`,
  );
  if (!apply) console.log("No changes applied. Re-run with --apply after the handoffs are performed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
