#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/tickets_snapshot.json", import.meta.url).pathname;

const CHANNELS = new Set(["wechat", "phone", "form", "email", "walk_in"]);
const URGENCIES = new Set(["urgent", "high", "normal", "low"]);
const TRIAGE_STATES = new Set(["new", "classified", "ticketed", "ignored"]);
const TICKET_STATUSES = new Set(["open", "assigned", "in_progress", "waiting", "resolved"]);
const PROPOSAL_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const SLA_STATES = new Set(["ok", "at_risk", "breached", "met"]);
const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: JsonObject, key: string, path: string, allowEmpty = false): void {
  if (typeof obj[key] !== "string" || (!allowEmpty && obj[key].length === 0)) {
    fail(`${path}.${key} must be a non-empty string`);
  }
}

function requireNumber(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj: JsonObject, key: string, path: string, allowed: Set<string>): void {
  if (!allowed.has(obj[key])) fail(`${path}.${key} has invalid value: ${obj[key]}`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: JsonObject;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.property)) fail("root.property must be an object");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "intake_count",
  "unclassified_intake",
  "ticket_count",
  "open_tickets",
  "resolved_tickets",
  "avg_resolution_hours",
  "sla_at_risk",
  "proposal_count",
  "needs_review",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!isObject(snapshot.metrics.intake_by_channel)) fail("root.metrics.intake_by_channel must be an object");
for (const key of ["intake", "tickets", "dispatch_proposals", "crews", "sync_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const crewIds = new Set();
snapshot.crews.forEach((crew, index) => {
  const path = `root.crews[${index}]`;
  if (!isObject(crew)) fail(`${path} must be an object`);
  for (const key of ["crew_id", "name"]) requireString(crew, key, path);
  if (!Array.isArray(crew.skills)) fail(`${path}.skills must be an array`);
  if (crewIds.has(crew.crew_id)) fail(`${path}.crew_id duplicates ${crew.crew_id}`);
  crewIds.add(crew.crew_id);
});

const ticketIds = new Set();
snapshot.tickets.forEach((ticket, index) => {
  const path = `root.tickets[${index}]`;
  if (!isObject(ticket)) fail(`${path} must be an object`);
  for (const key of ["id", "title", "category", "created_at", "updated_at"]) requireString(ticket, key, path);
  requireEnum(ticket, "status", path, TICKET_STATUSES);
  requireEnum(ticket, "urgency", path, URGENCIES);
  requireEnum(ticket, "sla_state", path, SLA_STATES);
  requireString(ticket, "sla_due_at", path, true);
  if (ticketIds.has(ticket.id)) fail(`${path}.id duplicates ${ticket.id}`);
  ticketIds.add(ticket.id);
  if (ticket.crew_id && !crewIds.has(ticket.crew_id)) fail(`${path}.crew_id does not match a crew: ${ticket.crew_id}`);
  if (!Array.isArray(ticket.intake_ids)) fail(`${path}.intake_ids must be an array`);
  if (!Array.isArray(ticket.history)) fail(`${path}.history must be an array`);
  ticket.history.forEach((event, eventIndex) => {
    const eventPath = `${path}.history[${eventIndex}]`;
    if (!isObject(event)) fail(`${eventPath} must be an object`);
    for (const key of ["event", "at"]) requireString(event, key, eventPath);
  });
});

const intakeIds = new Set();
const dedupeKeys = new Set();
snapshot.intake.forEach((item, index) => {
  const path = `root.intake[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of ["id", "text", "received_at"]) requireString(item, key, path);
  requireEnum(item, "channel", path, CHANNELS);
  requireEnum(item, "urgency_guess", path, URGENCIES);
  requireEnum(item, "triage_state", path, TRIAGE_STATES);
  if (intakeIds.has(item.id)) fail(`${path}.id duplicates ${item.id}`);
  intakeIds.add(item.id);
  const dedupeKey = `${item.channel}:${item.external_id || item.content_hash || item.id}`;
  if (dedupeKeys.has(dedupeKey)) fail(`${path} duplicates dedupe key ${dedupeKey}`);
  dedupeKeys.add(dedupeKey);
  if (item.ticket_id && !ticketIds.has(item.ticket_id))
    fail(`${path}.ticket_id does not match a ticket: ${item.ticket_id}`);
  if (/\d{7,}/.test(String(item.contact_masked || ""))) fail(`${path}.contact_masked looks unmasked`);
});

const proposalIds = new Set();
const proposalRefs = new Set();
snapshot.dispatch_proposals.forEach((proposal, index) => {
  const path = `root.dispatch_proposals[${index}]`;
  if (!isObject(proposal)) fail(`${path} must be an object`);
  for (const key of ["id", "ticket_id", "title", "reason"]) requireString(proposal, key, path);
  requireNumber(proposal, "ref", path);
  requireNumber(proposal, "sla_hours", path);
  requireEnum(proposal, "status", path, PROPOSAL_STATUSES);
  requireEnum(proposal, "priority", path, PRIORITIES);
  if (proposalIds.has(proposal.id)) fail(`${path}.id duplicates ${proposal.id}`);
  proposalIds.add(proposal.id);
  if (proposalRefs.has(proposal.ref)) fail(`${path}.ref duplicates ${proposal.ref}`);
  proposalRefs.add(proposal.ref);
  if (!ticketIds.has(proposal.ticket_id)) fail(`${path}.ticket_id does not match a ticket: ${proposal.ticket_id}`);
  if (proposal.proposed_crew_id && !crewIds.has(proposal.proposed_crew_id)) {
    fail(`${path}.proposed_crew_id does not match a crew: ${proposal.proposed_crew_id}`);
  }
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["at", "source", "action"]) requireString(entry, key, path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
