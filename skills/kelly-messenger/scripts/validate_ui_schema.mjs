#!/usr/bin/env node
// Validates app/.data/messages_snapshot.json (arg 1) and, when present,
// app/.data/outbox.json (arg 2) against references/messenger-schema.md.
import fs from "node:fs/promises";

const snapshotTarget = process.argv[2] || new URL("../app/.data/messages_snapshot.json", import.meta.url).pathname;
const outboxTarget = process.argv[3] || new URL("../app/.data/outbox.json", import.meta.url).pathname;
const outboxExplicit = Boolean(process.argv[3]);

const REPLY_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const DIRECTIONS = new Set(["incoming", "outgoing"]);
const KINDS = new Set(["dm", "group", "channel", "thread"]);
const CONNECTORS = new Set(["slack", "discord", "telegram", "whatsapp_cloud", "browser_agent", "manual"]);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
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
for (const key of ["account_count", "conversation_count", "message_count", "unread_count", "awaiting_reply_count"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.accounts)) fail("root.accounts must be an array");
if (!Array.isArray(snapshot.conversations)) fail("root.conversations must be an array");
if (!Array.isArray(snapshot.sync_log)) fail("root.sync_log must be an array");
if (!Array.isArray(snapshot.warnings)) fail("root.warnings must be an array");

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "platform", "connector", "display_name", "status"])
    requireString(account, key, path);
  if (!CONNECTORS.has(account.connector)) fail(`${path}.connector must be one of ${[...CONNECTORS].join("|")}`);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
  for (const key of ["unread_count", "conversation_count"]) requireNumber(account, key, path);
});

const conversationIds = new Set();
snapshot.conversations.forEach((conversation, index) => {
  const path = `root.conversations[${index}]`;
  if (!isObject(conversation)) fail(`${path} must be an object`);
  for (const key of ["conversation_id", "account_id", "platform", "kind", "title", "last_message_at"]) {
    requireString(conversation, key, path);
  }
  if (!KINDS.has(conversation.kind)) fail(`${path}.kind must be one of ${[...KINDS].join("|")}`);
  requireBoolean(conversation, "unread", path);
  requireBoolean(conversation, "awaiting_reply", path);
  if (conversationIds.has(conversation.conversation_id))
    fail(`${path}.conversation_id duplicates ${conversation.conversation_id}`);
  conversationIds.add(conversation.conversation_id);
  if (!accountIds.has(conversation.account_id))
    fail(`${path}.account_id does not match an account: ${conversation.account_id}`);
  if (!Array.isArray(conversation.participants)) fail(`${path}.participants must be an array`);
  if (!Array.isArray(conversation.messages) || !conversation.messages.length)
    fail(`${path}.messages must be a non-empty array`);
  const messageIds = new Set();
  conversation.messages.forEach((message, mIndex) => {
    const mPath = `${path}.messages[${mIndex}]`;
    if (!isObject(message)) fail(`${mPath} must be an object`);
    for (const key of ["message_id", "direction", "sender", "sent_at"]) requireString(message, key, mPath);
    if (typeof message.text !== "string") fail(`${mPath}.text must be a string`);
    if (!DIRECTIONS.has(message.direction)) fail(`${mPath}.direction must be incoming|outgoing`);
    if (messageIds.has(message.message_id)) fail(`${mPath}.message_id duplicates ${message.message_id}`);
    messageIds.add(message.message_id);
  });
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

let outbox = null;
try {
  outbox = JSON.parse(await fs.readFile(outboxTarget, "utf8"));
} catch (error) {
  if (outboxExplicit || error.code !== "ENOENT") fail(`cannot read outbox ${outboxTarget}: ${error.message}`);
}

if (outbox) {
  if (!isObject(outbox)) fail("outbox root must be an object");
  requireString(outbox, "schema_version", "outbox");
  if (!Array.isArray(outbox.replies)) fail("outbox.replies must be an array");
  const replyIds = new Set();
  const refs = new Set();
  outbox.replies.forEach((reply, index) => {
    const path = `outbox.replies[${index}]`;
    if (!isObject(reply)) fail(`${path} must be an object`);
    for (const key of ["reply_id", "conversation_id", "account_id", "platform", "text", "status", "created_at"]) {
      requireString(reply, key, path);
    }
    requireNumber(reply, "ref", path);
    if (!REPLY_STATUSES.has(reply.status)) fail(`${path}.status must be one of ${[...REPLY_STATUSES].join("|")}`);
    if (replyIds.has(reply.reply_id)) fail(`${path}.reply_id duplicates ${reply.reply_id}`);
    replyIds.add(reply.reply_id);
    if (refs.has(reply.ref)) fail(`${path}.ref duplicates #${reply.ref}`);
    refs.add(reply.ref);
    if (!conversationIds.has(reply.conversation_id))
      fail(`${path}.conversation_id does not match a conversation: ${reply.conversation_id}`);
    if (reply.decision !== null && reply.decision !== undefined) {
      if (!isObject(reply.decision)) fail(`${path}.decision must be an object or null`);
      requireString(reply.decision, "action", `${path}.decision`);
    }
    if (reply.status === "done") {
      if (!isObject(reply.execution)) fail(`${path}.execution must be an object when status is done`);
      for (const key of ["status", "operation"]) requireString(reply.execution, key, `${path}.execution`);
    }
  });
  console.log(`OK: ${outboxTarget}`);
}
