#!/usr/bin/env node
// Trusted hand-off step. Kelly Tickets' AirApp only ever proposes a dispatch
// (crew, priority, SLA) and records a human verdict (approve / request
// changes / block / revise) on the proposal record. This script is the
// process authorized to act on an `approved` verdict — and it performs NO
// external side effects: it never actually notifies a crew or replies to a
// resident. It writes a message-draft handoff and a board-transition plan
// onto the proposal record; the agent sends the real crew notification
// outside the app (via messenger/email/WeChat skills) only after this plan
// is reviewed, then records the real outcome via
// scripts/apply_triage.mjs's ticket_updates[].
//
// The message-draft/operations-plan logic below is ported verbatim from the
// retired scripts/execute_decisions.ts, including its two-step
// dry-run -> --apply -> --apply "alreadyHandedOff" idempotency: the first
// --apply run writes execution_status "ready_for_agent"; a second --apply
// run (confirming the agent already acted on it) finalizes it to "executed"
// and only then promotes the proposal's workflow status to "done" — matching
// the retired mergeSnapshot()'s `execution.status === "executed" -> "done"`
// rule. There is no separate execution_report.json bucket in the
// Busabase-only shape (Busabase reads are always live) — the plan is written
// directly onto each proposal's own execution_* fields.
//
// Usage:
//   node scripts/execute_decisions.mjs              Dry run: print the plan for every approved proposal.
//   node scripts/execute_decisions.mjs --apply       Write execution_status="ready_for_agent" (first run) or
//                                                     "executed" + status="done" (second run) onto each approved proposal.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads dispatch proposals with status "approved" from Busabase. Without
--apply this is a dry run that only prints the planned notify_crew /
update_board operations for each. With --apply it writes execution markers
onto each approved proposal — it never sends the real crew notification
itself. The agent performs that outside the app, then records the outcome
via scripts/apply_triage.mjs's ticket_updates[].`);
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

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

function baseProposalFields(row) {
  return {
    proposal_id: row.proposal_id,
    ref: row.ref,
    ticket_id: row.ticket_id,
    title: row.title,
    summary: row.summary || "",
    proposed_crew_id: row.proposed_crew_id || "",
    proposed_assignee: row.proposed_assignee || "",
    priority: row.priority || "P3",
    sla_due_at: row.sla_due_at || "",
    sla_hours: row.sla_hours,
    reason: row.reason || "",
    note_to_crew: row.note_to_crew || "",
    status: row.status,
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decision_draft: row.decision_draft || "",
    decided_at: row.decided_at || "",
    created_at: row.created_at || "",
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const dryRun = !apply;

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Tickets Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [proposals, tickets, crews] = await Promise.all([
    readAll(client, declared("proposals")),
    readAll(client, declared("tickets")),
    readAll(client, declared("crews")),
  ]);
  const approved = proposals.filter((proposal) => proposal.status === "approved");

  if (!approved.length) {
    console.log("No approved dispatch proposals to execute. Nothing written.");
    return;
  }

  const ticketsById = new Map(tickets.map((ticket) => [ticket.ticket_id, ticket]));
  const crewsById = new Map(crews.map((crew) => [crew.crew_id, crew]));

  for (const proposal of approved) {
    const ticket = ticketsById.get(proposal.ticket_id);
    const crew = crewsById.get(proposal.proposed_crew_id);
    // A proposal already handed to the agent ("ready_for_agent") in a prior
    // --apply run is being re-selected only because nothing had marked it
    // terminal yet. Treat this second --apply as the "record the real result
    // here" step: finalize it as executed so it stops re-triggering
    // notify_crew plans, and promote the workflow status to "done" —
    // matching the retired mergeSnapshot()'s promotion rule.
    const alreadyHandedOff = !dryRun && proposal.execution_status === "ready_for_agent";

    if (!ticket || !crew) {
      const detail = !ticket
        ? `Ticket ${proposal.ticket_id} not found in Busabase; re-run scripts/apply_triage.mjs before executing.`
        : `Crew ${proposal.proposed_crew_id} is not configured; ask the user to add it before executing.`;
      console.log(`  Dispatch #${proposal.ref} -> blocked (${detail})`);
      if (apply) {
        await client.records.changeRequest({
          recordId: proposal.__recordId,
          operation: "update",
          fields: toBusabaseFields({
            ...baseProposalFields(proposal),
            execution_status: "blocked",
            execution_operations: "[]",
            execution_detail: detail,
            executed_at: new Date().toISOString(),
          }),
          message: `Execution blocked for dispatch ${proposal.proposal_id}`,
          author: "kelly-tickets-execute-decisions",
          baseCommitId: proposal.__headCommitId,
          autoMerge: true,
        });
      }
      continue;
    }

    const contactReady = Boolean(crew.contact_env && process.env[crew.contact_env]);
    const message = [
      `[${proposal.priority}] ${ticket.ticket_id} ${ticket.title}`,
      [ticket.unit, ticket.location].filter(Boolean).join(" · "),
      `SLA: ${proposal.sla_due_at}`,
      proposal.note_to_crew || proposal.reason,
    ]
      .filter(Boolean)
      .join("\n");
    const operations = [
      {
        operation: "notify_crew",
        target: crew.crew_id,
        contact_env: crew.contact_env || "",
        contact_ready: contactReady,
        message_draft: message,
      },
      {
        operation: "update_board",
        target: ticket.ticket_id,
        from_status: ticket.status,
        to_status: "assigned",
        crew_id: crew.crew_id,
        assignee: proposal.proposed_assignee || "",
      },
    ];
    const status = dryRun ? "planned" : alreadyHandedOff ? "executed" : "ready_for_agent";
    const detail = dryRun
      ? `Dry run: would hand the message draft to ${crew.name} and move ${ticket.ticket_id} to assigned.${contactReady ? "" : ` Contact env ${crew.contact_env || "(unset)"} is not configured.`}`
      : alreadyHandedOff
        ? `Executed: ${crew.name} was already handed this plan in a prior apply run; recorded as executed. Confirm the real outcome via scripts/apply_triage.mjs ticket_updates.`
        : `Approved: agent should notify ${crew.name}${contactReady ? "" : ` after configuring ${crew.contact_env || "a contact env"}`}, then record the real result via scripts/apply_triage.mjs ticket_updates and update the board.`;

    console.log(
      `  Dispatch #${proposal.ref} -> ${operations.map((op) => op.operation).join(" + ")} (${status}) ${ticket.ticket_id}`,
    );
    console.log(`    ${detail}`);

    if (apply) {
      const now = new Date().toISOString();
      await client.records.changeRequest({
        recordId: proposal.__recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...baseProposalFields(proposal),
          status: alreadyHandedOff ? "done" : proposal.status,
          execution_status: status,
          execution_operations: JSON.stringify(operations),
          execution_detail: detail,
          executed_at: now,
        }),
        message: `Record execution plan for dispatch ${proposal.proposal_id}: ${status}`,
        author: "kelly-tickets-execute-decisions",
        baseCommitId: proposal.__headCommitId,
        autoMerge: true,
      });
    }
  }

  if (dryRun) {
    console.log("Re-run with --apply to mark items ready_for_agent. No external side effects either way.");
    return;
  }
  console.log(
    "Recorded execution markers on each approved dispatch. No external side effects either way — the agent performs the real crew notification outside the app per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
