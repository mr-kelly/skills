#!/usr/bin/env node
// Write path for agent-produced classifications, dispatch proposals, and
// crew/board updates. Classification itself is LLM work (see SKILL.md); this
// script is the deterministic merge: it creates tickets from classified
// intake, computes SLA targets from config sla_rules, assigns stable refs to
// dispatch proposals, appends ticket history, and recomputes metrics.
// Usage: node scripts/apply_triage.mjs <payload.json>

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  computeMetrics,
  computeSlaState,
  ensureDirs,
  readConfig,
  readJson,
  readLock,
  readSnapshot,
  slaHoursFor,
  writeJson,
} from "../app/server/store.mjs";

const URGENCIES = new Set(["urgent", "high", "normal", "low"]);
const TICKET_STATUSES = new Set(["open", "assigned", "in_progress", "waiting", "resolved"]);
const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);

const payloadFile = process.argv[2];

function fail(message) {
  console.error(`kelly-tickets triage: ${message}`);
  process.exit(1);
}

if (!payloadFile) fail("usage: node scripts/apply_triage.mjs <payload.json>");

await ensureDirs();

const existingLock = await readLock();
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

const payload = await readJson(payloadFile, null);
if (!payload) fail(`cannot read payload ${payloadFile}`);
const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
const proposals = Array.isArray(payload.proposals) ? payload.proposals : [];
const ticketUpdates = Array.isArray(payload.ticket_updates) ? payload.ticket_updates : [];

await writeJson(LOCK_PATH, {
  owner: "kelly-tickets",
  message: "Applying triage results",
  started_at: new Date().toISOString(),
});

try {
  const snapshot = await readSnapshot();
  const configResult = await readConfig();
  const config = configResult.config || {};
  const now = new Date().toISOString();
  const crewIds = new Set((snapshot.crews || []).map((crew) => crew.crew_id));
  if (!snapshot.crews?.length && Array.isArray(config.crews)) {
    snapshot.crews = config.crews.map((crew) => ({
      crew_id: crew.crew_id,
      name: crew.name || crew.crew_id,
      skills: Array.isArray(crew.skills) ? crew.skills : [],
      members: crew.members || "",
      contact_env: crew.contact_env || "",
      open_tickets: 0,
      active: crew.active !== false,
    }));
    for (const crew of snapshot.crews) crewIds.add(crew.crew_id);
  }

  let nextTicketNumber = 1000;
  for (const ticket of snapshot.tickets || []) {
    const match = /^T-(\d+)$/.exec(ticket.id);
    if (match) nextTicketNumber = Math.max(nextTicketNumber, Number(match[1]));
  }
  let nextRef = 0;
  for (const proposal of snapshot.dispatch_proposals || []) {
    nextRef = Math.max(nextRef, Number(proposal.ref) || 0);
  }

  let ticketsCreated = 0;
  let ignored = 0;
  for (const entry of classifications) {
    const item = (snapshot.intake || []).find((candidate) => candidate.id === entry.intake_id);
    if (!item) fail(`classification references unknown intake_id: ${entry.intake_id}`);
    if (entry.action === "ignore") {
      item.triage_state = "ignored";
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
      item.triage_state = "ticketed";
      continue;
    }
    nextTicketNumber += 1;
    const ticketId = `T-${nextTicketNumber}`;
    const hours = slaHoursFor(config, entry.category, entry.urgency);
    const slaDueAt = new Date(Date.parse(now) + hours * 3600000).toISOString();
    const ticket = {
      id: ticketId,
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
      sla_state: "ok",
      intake_ids: [item.id],
      resolution_note: "",
      history: [
        { event: "intake", actor: "kelly-tickets", at: item.received_at, note: `Received via ${item.channel}.` },
        {
          event: "classified",
          actor: "kelly-tickets",
          at: now,
          note: String(entry.note || `Classified ${entry.category} / ${entry.urgency}; SLA ${hours}h.`),
        },
      ],
    };
    snapshot.tickets.push(ticket);
    item.triage_state = "ticketed";
    item.ticket_id = ticketId;
    ticketsCreated += 1;
  }

  let proposalsCreated = 0;
  for (const entry of proposals) {
    const ticket = (snapshot.tickets || []).find((candidate) => candidate.id === entry.ticket_id);
    if (!ticket) fail(`proposal references unknown ticket_id: ${entry.ticket_id}`);
    if (!crewIds.has(entry.crew_id)) fail(`proposal references unknown crew_id: ${entry.crew_id}`);
    if (!PRIORITIES.has(entry.priority)) fail(`proposal priority invalid for ${entry.ticket_id}: ${entry.priority}`);
    if (typeof entry.reason !== "string" || !entry.reason) fail(`proposal reason required for ${entry.ticket_id}`);
    nextRef += 1;
    const hours = slaHoursFor(config, ticket.category, ticket.urgency);
    const crewName = (snapshot.crews || []).find((crew) => crew.crew_id === entry.crew_id)?.name || entry.crew_id;
    snapshot.dispatch_proposals.push({
      id: `dp-${crypto.createHash("sha1").update(`${entry.ticket_id}|${nextRef}|${entry.crew_id}`).digest("hex").slice(0, 10)}`,
      ref: nextRef,
      ticket_id: entry.ticket_id,
      title: String(entry.title || `Dispatch ${crewName} to ${ticket.title}`),
      summary: String(entry.summary || ticket.title),
      proposed_crew_id: entry.crew_id,
      proposed_assignee: String(entry.assignee || ""),
      priority: entry.priority,
      sla_due_at: ticket.sla_due_at || new Date(Date.parse(now) + hours * 3600000).toISOString(),
      sla_hours: hours,
      reason: entry.reason,
      note_to_crew: String(entry.note_to_crew || ""),
      status: "needs_review",
      decision: null,
      execution: null,
    });
    ticket.history.push({
      event: "dispatch_proposed",
      actor: "kelly-tickets",
      at: now,
      note: `Proposed ${crewName}, ${entry.priority}, ${hours}h SLA.`,
    });
    ticket.updated_at = now;
    proposalsCreated += 1;
  }

  let updates = 0;
  for (const entry of ticketUpdates) {
    const ticket = (snapshot.tickets || []).find((candidate) => candidate.id === entry.ticket_id);
    if (!ticket) fail(`ticket_update references unknown ticket_id: ${entry.ticket_id}`);
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
    ticket.history.push({
      event,
      actor: String(entry.actor || "kelly-tickets"),
      at: now,
      note: String(entry.note || ""),
    });
    ticket.updated_at = now;
    if (entry.status === "resolved") ticket.resolved_at = now;
    updates += 1;
  }

  for (const ticket of snapshot.tickets || []) {
    ticket.sla_state = computeSlaState(ticket, now);
  }
  const openByCrew = new Map();
  for (const ticket of snapshot.tickets || []) {
    if (ticket.status === "resolved" || !ticket.crew_id) continue;
    openByCrew.set(ticket.crew_id, (openByCrew.get(ticket.crew_id) || 0) + 1);
  }
  for (const crew of snapshot.crews || []) {
    crew.open_tickets = openByCrew.get(crew.crew_id) || 0;
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-tickets";
  snapshot.metrics = computeMetrics(snapshot);
  snapshot.sync_log.push({
    at: now,
    source: "kelly-tickets",
    action: "triage",
    detail: `Classified ${classifications.length} intake items (${ticketsCreated} tickets created, ${ignored} ignored), proposed ${proposalsCreated} dispatches, applied ${updates} ticket updates.`,
    count: classifications.length,
  });
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(
    `Triage merged into ${SNAPSHOT_PATH}: ${ticketsCreated} tickets, ${proposalsCreated} proposals, ${updates} updates.`,
  );
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
