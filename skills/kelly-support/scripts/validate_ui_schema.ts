#!/usr/bin/env node
// Validates app/.data/support_snapshot.json (arg 1) and, when present,
// app/.data/decisions.json (arg 2) against references/support-schema.md.
import fs from "node:fs/promises";

const snapshotTarget = process.argv[2] || new URL("../app/.data/support_snapshot.json", import.meta.url).pathname;
const decisionsTarget = process.argv[3] || new URL("../app/.data/decisions.json", import.meta.url).pathname;
const decisionsExplicit = Boolean(process.argv[3]);

const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const CHANNELS = new Set(["email", "whatsapp", "webchat", "form", "wechat"]);
const CONNECTORS = new Set(["email_agent", "whatsapp_cloud", "webchat_widget", "form_intake", "wechat_work", "manual"]);
const CATEGORIES = new Set(["bug", "how_to", "billing", "refund", "complaint", "feature"]);
const PRIORITIES = new Set(["urgent", "high", "normal", "low"]);
const ACTIONS = new Set(["send_reply", "escalate", "refund", "close", "no_action"]);
const VERDICTS = new Set(["ship", "fix", "block"]);
const DIRECTIONS = new Set(["incoming", "outgoing"]);
const KB_KINDS = new Set(["article", "macro"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireBoolean(obj, key, path) {
  if (typeof obj[key] !== "boolean") fail(`${path}.${key} must be a boolean`);
}

async function readJsonOrFail(target, label) {
  const raw = await fs.readFile(target, "utf8").catch((error) => {
    fail(`cannot read ${label} ${target}: ${error.message}`);
  });
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${label}: ${error.message}`);
  }
}

const snapshot = await readJsonOrFail(snapshotTarget, "snapshot");

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "account_count",
  "ticket_count",
  "kb_count",
  "open_count",
  "awaiting_approval_count",
  "breaching_sla_count",
  "resolved_count",
  "csat_average",
  "csat_responses",
  "first_response_median_minutes",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const arrayKey of ["accounts", "tickets", "knowledge_base", "sync_log", "warnings"]) {
  if (!Array.isArray(snapshot[arrayKey])) fail(`root.${arrayKey} must be an array`);
}

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "channel", "connector", "display_name", "status"]) requireString(account, key, path);
  if (!CHANNELS.has(account.channel)) fail(`${path}.channel must be one of ${[...CHANNELS].join("|")}`);
  if (!CONNECTORS.has(account.connector)) fail(`${path}.connector must be one of ${[...CONNECTORS].join("|")}`);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
  for (const key of ["ticket_count", "unread_count"]) requireNumber(account, key, path);
});

const kbIds = new Set();
snapshot.knowledge_base.forEach((article, index) => {
  const path = `root.knowledge_base[${index}]`;
  if (!isObject(article)) fail(`${path} must be an object`);
  for (const key of ["article_id", "kind", "title", "body"]) requireString(article, key, path);
  if (!KB_KINDS.has(article.kind)) fail(`${path}.kind must be article|macro`);
  if (!Array.isArray(article.tags)) fail(`${path}.tags must be an array`);
  if (kbIds.has(article.article_id)) fail(`${path}.article_id duplicates ${article.article_id}`);
  kbIds.add(article.article_id);
});

const ticketIds = new Set();
const refs = new Set();
snapshot.tickets.forEach((ticket, index) => {
  const path = `root.tickets[${index}]`;
  if (!isObject(ticket)) fail(`${path} must be an object`);
  for (const key of [
    "ticket_id",
    "account_id",
    "channel",
    "subject",
    "category",
    "priority",
    "status",
    "proposed_action",
    "owner",
    "created_at",
    "last_message_at",
  ]) {
    requireString(ticket, key, path);
  }
  requireNumber(ticket, "ref", path);
  if (!CHANNELS.has(ticket.channel)) fail(`${path}.channel must be one of ${[...CHANNELS].join("|")}`);
  if (!CATEGORIES.has(ticket.category)) fail(`${path}.category must be one of ${[...CATEGORIES].join("|")}`);
  if (!PRIORITIES.has(ticket.priority)) fail(`${path}.priority must be one of ${[...PRIORITIES].join("|")}`);
  if (!STATUSES.has(ticket.status)) fail(`${path}.status must be one of ${[...STATUSES].join("|")}`);
  if (!ACTIONS.has(ticket.proposed_action)) fail(`${path}.proposed_action must be one of ${[...ACTIONS].join("|")}`);
  if (!isObject(ticket.customer)) fail(`${path}.customer must be an object`);
  requireString(ticket.customer, "name", `${path}.customer`);
  requireBoolean(ticket, "unread", path);
  if (typeof ticket.suggested_reply !== "string") fail(`${path}.suggested_reply must be a string`);
  if (!Array.isArray(ticket.kb_refs)) fail(`${path}.kb_refs must be an array`);
  for (const id of ticket.kb_refs) {
    if (typeof id !== "string") fail(`${path}.kb_refs entries must be strings`);
  }
  if (!isObject(ticket.sla)) fail(`${path}.sla must be an object`);
  requireString(ticket.sla, "policy", `${path}.sla`);
  requireBoolean(ticket.sla, "breached", `${path}.sla`);
  if (typeof ticket.sla.due_by !== "string") fail(`${path}.sla.due_by must be a string (may be empty)`);
  if (ticket.quality_gate !== null && ticket.quality_gate !== undefined) {
    if (!isObject(ticket.quality_gate)) fail(`${path}.quality_gate must be an object or null`);
    if (!VERDICTS.has(ticket.quality_gate.verdict)) fail(`${path}.quality_gate.verdict must be ship|fix|block`);
    requireNumber(ticket.quality_gate, "score", `${path}.quality_gate`);
    if (!Array.isArray(ticket.quality_gate.checks)) fail(`${path}.quality_gate.checks must be an array`);
  }
  if (ticket.csat !== null && ticket.csat !== undefined) {
    if (!isObject(ticket.csat)) fail(`${path}.csat must be an object or null`);
    requireNumber(ticket.csat, "score", `${path}.csat`);
    if (ticket.csat.score < 1 || ticket.csat.score > 5) fail(`${path}.csat.score must be 1-5`);
  }
  if (ticketIds.has(ticket.ticket_id)) fail(`${path}.ticket_id duplicates ${ticket.ticket_id}`);
  ticketIds.add(ticket.ticket_id);
  if (refs.has(ticket.ref)) fail(`${path}.ref duplicates #${ticket.ref}`);
  refs.add(ticket.ref);
  if (!accountIds.has(ticket.account_id)) fail(`${path}.account_id does not match an account: ${ticket.account_id}`);
  if (!Array.isArray(ticket.messages) || !ticket.messages.length) fail(`${path}.messages must be a non-empty array`);
  const messageIds = new Set();
  ticket.messages.forEach((message, mIndex) => {
    const mPath = `${path}.messages[${mIndex}]`;
    if (!isObject(message)) fail(`${mPath} must be an object`);
    for (const key of ["message_id", "direction", "sender", "sent_at"]) requireString(message, key, mPath);
    if (typeof message.text !== "string") fail(`${mPath}.text must be a string`);
    if (!DIRECTIONS.has(message.direction)) fail(`${mPath}.direction must be incoming|outgoing`);
    if (messageIds.has(message.message_id)) fail(`${mPath}.message_id duplicates ${message.message_id}`);
    messageIds.add(message.message_id);
  });
  if (ticket.status === "done" && ticket.proposed_action !== "no_action" && ticket.execution) {
    if (!isObject(ticket.execution)) fail(`${path}.execution must be an object when present`);
    for (const key of ["status", "operation"]) requireString(ticket.execution, key, `${path}.execution`);
  }
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["sync_id", "account_id", "method", "at", "status"]) requireString(entry, key, path);
  requireNumber(entry, "new_messages", path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${snapshotTarget}`);

let decisions = null;
try {
  decisions = JSON.parse(await fs.readFile(decisionsTarget, "utf8"));
} catch (error) {
  if (decisionsExplicit || error.code !== "ENOENT") fail(`cannot read decisions ${decisionsTarget}: ${error.message}`);
}

if (decisions) {
  if (!isObject(decisions)) fail("decisions root must be an object");
  requireString(decisions, "schema_version", "decisions");
  if (!isObject(decisions.decisions)) fail("decisions.decisions must be an object keyed by ticket id");
  for (const [ticketId, rawEntry] of Object.entries(decisions.decisions)) {
    const path = `decisions.decisions[${ticketId}]`;
    if (!isObject(rawEntry)) fail(`${path} must be an object`);
    const entry = rawEntry as { status?: string };
    requireString(entry, "action", path);
    requireString(entry, "decided_at", path);
    if (entry.status && !STATUSES.has(entry.status)) fail(`${path}.status must be one of ${[...STATUSES].join("|")}`);
  }
  console.log(`OK: ${decisionsTarget}`);
}
