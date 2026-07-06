#!/usr/bin/env node
// Dry-run-by-default execution stub for approved dispatch proposals.
// Re-checks the agent lock and decisions, then writes execution_report.json
// entries with concrete operations (notify_crew message-draft handoff and
// update_board ticket transitions). It performs NO external side effects:
// the agent sends the actual crew notifications outside the app after this
// plan is reviewed.
// Usage: node scripts/execute_decisions.mjs [--apply]

import { mergeSnapshot } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import type { Crew } from "../lib/types.ts";

const provider = await createProvider();

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function fail(message) {
  console.error(`kelly-tickets execute: ${message}`);
  process.exit(1);
}

await provider.ensureStore();

const existingLock = await provider.readLock();
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

const [snapshot, decisions, previousReport, configResult] = await Promise.all([
  provider.readSnapshot(),
  provider.readDecisions(),
  provider.readExecutionReport(),
  provider.readConfig(),
]);
const merged = mergeSnapshot(snapshot, decisions, previousReport);
const approved = merged.dispatch_proposals.filter((proposal) => proposal.status === "approved");

if (!approved.length) {
  console.log("No approved dispatch proposals to execute. Nothing written.");
  process.exit(0);
}

await provider.writeLock({
  owner: "kelly-tickets",
  message: dryRun ? "Dry-run: planning approved dispatches" : "Preparing approved dispatches for the agent",
  started_at: new Date().toISOString(),
});

try {
  const crewsById = new Map<string, Crew>((merged.crews || []).map((crew: Crew) => [crew.crew_id, crew]));
  const results = approved.map((proposal) => {
    const ticket = (merged.tickets || []).find((candidate) => candidate.id === proposal.ticket_id);
    const crew = crewsById.get(proposal.proposed_crew_id);
    if (!ticket || !crew) {
      return {
        id: proposal.id,
        ref: proposal.ref,
        title: proposal.title,
        ticket_id: proposal.ticket_id,
        crew_id: proposal.proposed_crew_id || "",
        operations: [],
        status: "blocked",
        detail: !ticket
          ? `Ticket ${proposal.ticket_id} not found in the snapshot; re-run triage before executing.`
          : `Crew ${proposal.proposed_crew_id} is not configured; ask the user to add it before executing.`,
      };
    }
    const contactReady = Boolean(crew.contact_env && process.env[crew.contact_env]);
    const message = [
      `[${proposal.priority}] ${ticket.id} ${ticket.title}`,
      [ticket.unit, ticket.location].filter(Boolean).join(" · "),
      `SLA: ${proposal.sla_due_at}`,
      proposal.note_to_crew || proposal.reason,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      id: proposal.id,
      ref: proposal.ref,
      title: proposal.title,
      ticket_id: ticket.id,
      crew_id: crew.crew_id,
      operations: [
        {
          operation: "notify_crew",
          target: crew.crew_id,
          contact_env: crew.contact_env || "",
          contact_ready: contactReady,
          message_draft: message,
        },
        {
          operation: "update_board",
          target: ticket.id,
          from_status: ticket.status,
          to_status: "assigned",
          crew_id: crew.crew_id,
          assignee: proposal.proposed_assignee || "",
        },
      ],
      status: dryRun ? "planned" : "ready_for_agent",
      detail: dryRun
        ? `Dry run: would hand the message draft to ${crew.name} and move ${ticket.id} to assigned.${contactReady ? "" : ` Contact env ${crew.contact_env || "(unset)"} is not configured.`}`
        : `Approved: agent should notify ${crew.name}${contactReady ? "" : ` after configuring ${crew.contact_env || "a contact env"}`}, then record the real result here and update the board via apply_triage.`,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    source: "kelly-tickets",
    config_path: configResult.path,
    results,
  };
  await provider.writeExecutionReport(report);
  console.log(`${dryRun ? "Dry run" : "Execution plan"} written via "${provider.kind}" provider.`);
  for (const result of results) {
    console.log(
      `  Dispatch #${result.ref} -> ${result.operations.map((op) => op.operation).join(" + ") || "blocked"} (${result.status}) ${result.ticket_id}`,
    );
  }
  if (dryRun) console.log("Re-run with --apply to mark items ready_for_agent. No external side effects either way.");
} finally {
  await provider.clearLock();
}
