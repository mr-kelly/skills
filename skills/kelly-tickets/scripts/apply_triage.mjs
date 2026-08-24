#!/usr/bin/env node
// Trusted hand-off step. Classification and dispatch proposals are LLM work
// (see SKILL.md); this script is the deterministic merge that turns a
// triage payload into Busabase writes: it creates tickets from classified
// intake, computes SLA targets from the Settings row's sla_rules, assigns
// stable dispatch-proposal refs, appends ticket history, and applies
// crew/board updates from ticket_updates[]. sla_state and crew open-ticket
// load are never written — content/kelly-tickets-app/app/js/tickets-model.js's buildSnapshot()
// computes both fresh on every read, exactly like busabase-provider.js does
// for the AirApp.
//
// The validation/id-generation/SLA logic below is ported verbatim from the
// retired scripts/apply_triage.ts; only the write target changed, from a
// persisted content/kelly-tickets-app/.data/tickets_snapshot.json to Busabase's intake/tickets/
// proposals/sync_log Bases.
//
// Usage: node scripts/apply_triage.mjs <payload.json> [--apply]
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-tickets-app/app/js/config.js";
import { slaHoursFor } from "../content/kelly-tickets-app/app/js/tickets-model.js";

const URGENCIES = new Set(["urgent", "high", "normal", "low"]);
const TICKET_STATUSES = new Set(["open", "assigned", "in_progress", "waiting", "resolved"]);
const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);

function help() {
  console.log(`Usage: node scripts/apply_triage.mjs <payload.json> [--apply]

Merges a triage payload ({ classifications, proposals, ticket_updates }, see
references/tickets-schema.md) into Busabase: creates tickets (T-1001-style
ids) from classified intake, computes sla_due_at from the Settings row's
sla_rules, assigns stable dispatch-proposal refs, appends ticket history, and
applies crew/status/resolution updates. Without --apply this is a dry run.`);
}

/** @returns {never} */
function fail(message) {
  console.error(`kelly-tickets triage: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
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

async function findRecord(client, declared, idFieldSlug, idValue) {
  try {
    return await client.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function createRow(client, declared, fields, message, apply) {
  console.log(`  ${apply ? "create" : "would create"} ${declared.key} ${Object.values(fields)[0]}`);
  if (!apply) return;
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-tickets-triage",
    autoMerge: true,
  });
}

async function updateRow(client, declared, existing, fields, message, apply) {
  console.log(`  ${apply ? "update" : "would update"} ${declared.key} ${Object.values(fields)[0]}`);
  if (!apply) return;
  await client.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-tickets-triage",
    baseCommitId: existing.headCommitId,
    autoMerge: true,
  });
}

function baseIntakeFields(row) {
  return {
    intake_id: row.intake_id,
    channel: row.channel,
    external_id: row.external_id || "",
    content_hash: row.content_hash || "",
    reporter: row.reporter || "",
    contact_masked: row.contact_masked || "",
    unit: row.unit || "",
    location: row.location || "",
    text: row.text || "",
    received_at: row.received_at || "",
    urgency_guess: row.urgency_guess || "normal",
    category_guess: row.category_guess || "other",
    triage_state: row.triage_state,
    ticket_id: row.ticket_id || "",
    attachments_note: row.attachments_note || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decision_fields: row.decision_fields || "",
    decided_at: row.decided_at || "",
  };
}

function baseTicketFields(row) {
  return {
    ticket_id: row.ticket_id,
    title: row.title,
    category: row.category,
    urgency: row.urgency,
    unit: row.unit || "",
    location: row.location || "",
    reporter: row.reporter || "",
    contact_masked: row.contact_masked || "",
    status: row.status,
    crew_id: row.crew_id || "",
    assignee: row.assignee || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    resolved_at: row.resolved_at || "",
    sla_due_at: row.sla_due_at || "",
    intake_ids: row.intake_ids || "",
    resolution_note: row.resolution_note || "",
    history: row.history || "",
  };
}

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadFile = argv.find((arg) => !arg.startsWith("--"));
  if (!payloadFile) return help();

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

  const payload = JSON.parse(
    await readFile(payloadFile, "utf8").catch((error) => fail(`cannot read ${payloadFile}: ${error.message}`)),
  );
  const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
  const proposalsPayload = Array.isArray(payload.proposals) ? payload.proposals : [];
  const ticketUpdates = Array.isArray(payload.ticket_updates) ? payload.ticket_updates : [];

  const [existingTickets, existingProposals, crews, settingsRows] = await Promise.all([
    readAll(client, declared("tickets")),
    readAll(client, declared("proposals")),
    readAll(client, declared("crews")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const crewIds = new Set(crews.map((crew) => crew.crew_id));
  const ticketIds = new Set(existingTickets.map((ticket) => ticket.ticket_id));
  const crewName = (crewId) => crews.find((crew) => crew.crew_id === crewId)?.name || crewId;

  let nextTicketNumber = 1000;
  for (const ticket of existingTickets) {
    const match = /^T-(\d+)$/.exec(ticket.ticket_id);
    if (match) nextTicketNumber = Math.max(nextTicketNumber, Number(match[1]));
  }
  let nextRef = 0;
  for (const proposal of existingProposals) {
    nextRef = Math.max(nextRef, Number(proposal.ref) || 0);
  }

  const now = new Date().toISOString();
  let ticketsCreated = 0;
  let ignored = 0;

  for (const entry of classifications) {
    const existing = await findRecord(client, declared("intake"), "intake-id", entry.intake_id);
    if (!existing) fail(`classification references unknown intake_id: ${entry.intake_id}`);
    const item = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    item.intake_id = entry.intake_id;

    if (entry.action === "ignore") {
      await updateRow(
        client,
        declared("intake"),
        existing,
        { ...baseIntakeFields(item), triage_state: "ignored" },
        `Ignore intake ${entry.intake_id}`,
        apply,
      );
      ignored += 1;
      continue;
    }
    if (entry.action !== "ticket") fail(`classification action must be "ticket" or "ignore": ${entry.action}`);
    if (!URGENCIES.has(entry.urgency)) fail(`classification urgency invalid for ${entry.intake_id}: ${entry.urgency}`);
    if (typeof entry.category !== "string" || !entry.category)
      fail(`classification category required for ${entry.intake_id}`);
    item.category_guess = entry.category;
    item.urgency_guess = entry.urgency;
    if (entry.unit) item.unit = String(entry.unit);
    if (entry.location) item.location = String(entry.location);

    if (item.ticket_id) {
      await updateRow(
        client,
        declared("intake"),
        existing,
        { ...baseIntakeFields(item), triage_state: "ticketed" },
        `Re-classify intake ${entry.intake_id}`,
        apply,
      );
      continue;
    }

    nextTicketNumber += 1;
    const ticketId = `T-${nextTicketNumber}`;
    const hours = slaHoursFor(settings, entry.category, entry.urgency);
    const slaDueAt = new Date(Date.parse(now) + hours * 3600000).toISOString();
    const history = [
      { event: "intake", actor: "kelly-tickets", at: item.received_at, note: `Received via ${item.channel}.` },
      {
        event: "classified",
        actor: "kelly-tickets",
        at: now,
        note: String(entry.note || `Classified ${entry.category} / ${entry.urgency}; SLA ${hours}h.`),
      },
    ];
    const ticketFields = {
      ticket_id: ticketId,
      title: String(entry.title || item.text.slice(0, 80)),
      category: entry.category,
      urgency: entry.urgency,
      unit: item.unit || "",
      location: item.location || "",
      reporter: item.reporter || "",
      contact_masked: item.contact_masked || "",
      status: "open",
      crew_id: "",
      assignee: "",
      created_at: now,
      updated_at: now,
      resolved_at: "",
      sla_due_at: slaDueAt,
      intake_ids: JSON.stringify([item.intake_id]),
      resolution_note: "",
      history: JSON.stringify(history),
    };
    await createRow(
      client,
      declared("tickets"),
      ticketFields,
      `Create ticket ${ticketId} from intake ${entry.intake_id}`,
      apply,
    );
    ticketIds.add(ticketId);
    ticketsCreated += 1;

    await updateRow(
      client,
      declared("intake"),
      existing,
      { ...baseIntakeFields(item), triage_state: "ticketed", ticket_id: ticketId },
      `Convert intake ${entry.intake_id} to ${ticketId}`,
      apply,
    );
  }

  let proposalsCreated = 0;
  for (const entry of proposalsPayload) {
    if (!ticketIds.has(entry.ticket_id)) fail(`proposal references unknown ticket_id: ${entry.ticket_id}`);
    if (!crewIds.has(entry.crew_id)) fail(`proposal references unknown crew_id: ${entry.crew_id}`);
    if (!PRIORITIES.has(entry.priority)) fail(`proposal priority invalid for ${entry.ticket_id}: ${entry.priority}`);
    if (typeof entry.reason !== "string" || !entry.reason) fail(`proposal reason required for ${entry.ticket_id}`);

    const ticketRecord = await findRecord(client, declared("tickets"), "ticket-id", entry.ticket_id);
    const ticket = normalizeFields(
      ticketRecord.headCommit?.payload || ticketRecord.headCommit?.fields || ticketRecord.fields,
    );
    ticket.ticket_id = entry.ticket_id;

    nextRef += 1;
    const hours = slaHoursFor(settings, ticket.category, ticket.urgency);
    const proposalId = `dp-${crypto
      .createHash("sha1")
      .update(`${entry.ticket_id}|${nextRef}|${entry.crew_id}`)
      .digest("hex")
      .slice(0, 10)}`;
    const proposalFields = {
      proposal_id: proposalId,
      ref: nextRef,
      ticket_id: entry.ticket_id,
      title: String(entry.title || `Dispatch ${crewName(entry.crew_id)} to ${ticket.title}`),
      summary: String(entry.summary || ticket.title),
      proposed_crew_id: entry.crew_id,
      proposed_assignee: String(entry.assignee || ""),
      priority: entry.priority,
      sla_due_at: ticket.sla_due_at || new Date(Date.parse(now) + hours * 3600000).toISOString(),
      sla_hours: hours,
      reason: entry.reason,
      note_to_crew: String(entry.note_to_crew || ""),
      status: "needs_review",
      decision_action: "",
      decision_note: "",
      decision_draft: "",
      decided_at: "",
      execution_status: "",
      execution_operations: "",
      execution_detail: "",
      executed_at: "",
      created_at: now,
    };
    await createRow(
      client,
      declared("proposals"),
      proposalFields,
      `Propose dispatch ${proposalId} for ${entry.ticket_id}`,
      apply,
    );
    proposalsCreated += 1;

    const history = parseJsonValue(ticket.history, []) || [];
    history.push({
      event: "dispatch_proposed",
      actor: "kelly-tickets",
      at: now,
      note: `Proposed ${crewName(entry.crew_id)}, ${entry.priority}, ${hours}h SLA.`,
    });
    await updateRow(
      client,
      declared("tickets"),
      ticketRecord,
      { ...baseTicketFields(ticket), updated_at: now, history: JSON.stringify(history) },
      `Log dispatch proposal on ${entry.ticket_id}`,
      apply,
    );
  }

  let updates = 0;
  for (const entry of ticketUpdates) {
    const ticketRecord = await findRecord(client, declared("tickets"), "ticket-id", entry.ticket_id);
    if (!ticketRecord) fail(`ticket_update references unknown ticket_id: ${entry.ticket_id}`);
    const ticket = normalizeFields(
      ticketRecord.headCommit?.payload || ticketRecord.headCommit?.fields || ticketRecord.fields,
    );
    ticket.ticket_id = entry.ticket_id;

    if (entry.status) {
      if (!TICKET_STATUSES.has(entry.status))
        fail(`ticket_update status invalid for ${entry.ticket_id}: ${entry.status}`);
      ticket.status = entry.status;
    }
    if (entry.crew_id) {
      if (!crewIds.has(entry.crew_id)) fail(`ticket_update references unknown crew_id: ${entry.crew_id}`);
      ticket.crew_id = entry.crew_id;
    }
    if (entry.assignee !== undefined) ticket.assignee = String(entry.assignee || "");
    if (entry.resolution_note) ticket.resolution_note = String(entry.resolution_note);
    const event = entry.status === "resolved" ? "resolved" : String(entry.event || "crew_update");
    const history = parseJsonValue(ticket.history, []) || [];
    history.push({ event, actor: String(entry.actor || "kelly-tickets"), at: now, note: String(entry.note || "") });

    const fields = { ...baseTicketFields(ticket), updated_at: now, history: JSON.stringify(history) };
    if (entry.status === "resolved") fields.resolved_at = now;
    await updateRow(client, declared("tickets"), ticketRecord, fields, `Update ${entry.ticket_id}`, apply);
    updates += 1;
  }

  const logId = `log-${now.replace(/[-:TZ.]/g, "").slice(0, 14)}-triage`;
  await createRow(
    client,
    declared("sync-log"),
    {
      log_id: logId,
      at: now,
      source: "kelly-tickets",
      action: "triage",
      detail: `Classified ${classifications.length} intake items (${ticketsCreated} tickets created, ${ignored} ignored), proposed ${proposalsCreated} dispatches, applied ${updates} ticket updates.`,
      count: classifications.length,
    },
    `Sync log ${logId}`,
    apply,
  );

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase intake/tickets/proposals Bases`);
  console.log(`  tickets: +${ticketsCreated} created, ${ignored} intake ignored`);
  console.log(`  proposals: +${proposalsCreated} created`);
  console.log(`  ticket_updates: ${updates} applied`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
  else
    console.log(
      "Next: send the user to #/dispatch to review, then node scripts/execute_decisions.mjs after approvals.",
    );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
