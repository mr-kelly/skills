#!/usr/bin/env node
// Single write-path for agent-browsed or manual message payloads.
// Usage: node scripts/ingest_messages.mjs /path/to/payload.json
//
// Payload shape (see references/messenger-schema.md):
// {
//   "account_id": "wa-personal",
//   "collected_at": "ISO timestamp",
//   "method": "browser_agent" | "manual",
//   "conversations": [ { conversation_id?, title, kind?, channel?, participants?, messages: [...] } ]
// }
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  mergeConversations,
  readConfig,
  readLock,
  readSnapshot,
  recomputeMetrics,
  writeJson,
} from "../app/server/store.mjs";

function fail(message) {
  console.error(`Ingest failed: ${message}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail("pass a payload JSON file, e.g. node scripts/ingest_messages.mjs collected.json");

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

let payload;
try {
  payload = JSON.parse(await fs.readFile(file, "utf8"));
} catch (error) {
  fail(`cannot read ${file}: ${error.message}`);
}

if (!payload || typeof payload !== "object") fail("payload must be a JSON object");
if (!payload.account_id || typeof payload.account_id !== "string") fail("payload.account_id must be a string");
if (!Array.isArray(payload.conversations) || !payload.conversations.length)
  fail("payload.conversations must be a non-empty array");

const { config } = await readConfig();
const account = (config.accounts || []).find((item) => item.account_id === payload.account_id);
if (!account) fail(`payload.account_id "${payload.account_id}" is not in the config accounts[]`);

const method = payload.method === "manual" ? "manual" : "browser_agent";
const nowIso = new Date().toISOString();
const conversations = payload.conversations.map((conversation, index) => {
  const path = `conversations[${index}]`;
  if (!conversation || typeof conversation !== "object") fail(`${path} must be an object`);
  if (!Array.isArray(conversation.messages) || !conversation.messages.length)
    fail(`${path}.messages must be a non-empty array`);
  const messages = conversation.messages.map((message, mIndex) => {
    const mPath = `${path}.messages[${mIndex}]`;
    if (!message.message_id || typeof message.message_id !== "string") fail(`${mPath}.message_id must be a string`);
    if (message.direction !== "incoming" && message.direction !== "outgoing")
      fail(`${mPath}.direction must be incoming|outgoing`);
    if (typeof message.text !== "string") fail(`${mPath}.text must be a string`);
    if (!message.sent_at || typeof message.sent_at !== "string") fail(`${mPath}.sent_at must be an ISO string`);
    return {
      message_id: message.message_id,
      direction: message.direction,
      sender: String(message.sender || (message.direction === "outgoing" ? "Kelly" : "unknown")),
      text: message.text,
      sent_at: message.sent_at,
      attachment: String(message.attachment || ""),
    };
  });
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  const conversationId =
    conversation.conversation_id ||
    `${account.platform}-${account.account_id}-${String(conversation.title || index)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
  return {
    conversation_id: conversationId,
    account_id: account.account_id,
    platform: account.platform,
    kind: conversation.kind || "dm",
    title: String(conversation.title || conversationId),
    channel: String(conversation.channel || ""),
    workspace: String(conversation.workspace || account.workspace || ""),
    participants: Array.isArray(conversation.participants)
      ? conversation.participants
      : [...new Set(messages.map((message) => message.sender))],
    unread:
      conversation.unread !== undefined ? Boolean(conversation.unread) : Boolean(last && last.direction === "incoming"),
    awaiting_reply:
      conversation.awaiting_reply !== undefined
        ? Boolean(conversation.awaiting_reply)
        : Boolean(last && last.direction === "incoming"),
    provider_conversation_id: String(conversation.provider_conversation_id || ""),
    last_message_at: last?.sent_at || "",
    last_incoming_at: lastIncoming?.sent_at || "",
    suggested_reply: String(conversation.suggested_reply || ""),
    messages,
  };
});

const lock = await readLock();
if (lock) {
  console.error(`Ingest refused: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

await writeJson(LOCK_PATH, { owner: "kelly-messenger", message: `Ingesting ${file}`, started_at: nowIso });
try {
  const snapshot = await readSnapshot();
  snapshot.source = "kelly-messenger";
  snapshot.accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  snapshot.sync_log = Array.isArray(snapshot.sync_log) ? snapshot.sync_log : [];
  snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
  const added = mergeConversations(snapshot, conversations);
  const owned = snapshot.conversations.filter((item) => item.account_id === account.account_id);
  const existing = snapshot.accounts.find((item) => item.account_id === account.account_id);
  const patch = {
    account_id: account.account_id,
    platform: account.platform,
    connector: account.connector || method,
    display_name: account.display_name || account.account_id,
    workspace: account.workspace || "",
    status: "ok",
    unread_count: owned.filter((item) => item.unread).length,
    conversation_count: owned.length,
    last_sync_at: payload.collected_at || nowIso,
  };
  if (existing) Object.assign(existing, patch);
  else snapshot.accounts.push(patch);
  snapshot.sync_log.push({
    sync_id: `ingest-${account.account_id}-${Date.now()}`,
    account_id: account.account_id,
    method,
    at: nowIso,
    status: "ok",
    message: `Ingested ${conversations.length} conversations from ${file}.`,
    new_messages: added,
  });
  snapshot.sync_log = snapshot.sync_log.slice(-100);
  snapshot.generated_at = nowIso;
  recomputeMetrics(snapshot);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Ingested ${conversations.length} conversations (${added} new messages) into ${SNAPSHOT_PATH}`);
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
