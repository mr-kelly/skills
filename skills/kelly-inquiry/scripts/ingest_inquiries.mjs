#!/usr/bin/env node
// Single write-path for agent-collected or manual inquiry payloads.
// Usage: node scripts/ingest_inquiries.mjs /path/to/payload.json
//
// Payload shape (see references/inquiry-schema.md):
// {
//   "account_id": "wa-sales",
//   "method": "whatsapp_cloud" | "instagram_graph" | "messenger_graph" | "email_agent" | "browser_agent" | "manual",
//   "collected_at": "ISO timestamp",
//   "inquiries": [ { inquiry_id?, customer{...}, product_interest?, stage?, messages: [...] } ]
// }
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  CONNECTORS,
  STAGES,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  mergeInquiries,
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
if (!file) fail("pass a payload JSON file, e.g. node scripts/ingest_inquiries.mjs collected.json");

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
if (!Array.isArray(payload.inquiries) || !payload.inquiries.length) fail("payload.inquiries must be a non-empty array");

const { config } = await readConfig();
const account = (config.accounts || []).find((item) => item.account_id === payload.account_id);
if (!account) fail(`payload.account_id "${payload.account_id}" is not in the config accounts[]`);

const method = CONNECTORS.includes(payload.method) ? payload.method : account.connector || "manual";
const nowIso = new Date().toISOString();

const inquiries = payload.inquiries.map((entry, index) => {
  const path = `inquiries[${index}]`;
  if (!entry || typeof entry !== "object") fail(`${path} must be an object`);
  if (!Array.isArray(entry.messages) || !entry.messages.length) fail(`${path}.messages must be a non-empty array`);
  const customer = entry.customer || {};
  if (!customer.name || typeof customer.name !== "string") fail(`${path}.customer.name must be a string`);
  if (entry.stage !== undefined && !STAGES.includes(entry.stage))
    fail(`${path}.stage must be one of ${STAGES.join("|")}`);
  const messages = entry.messages.map((message, mIndex) => {
    const mPath = `${path}.messages[${mIndex}]`;
    if (!message.message_id || typeof message.message_id !== "string") fail(`${mPath}.message_id must be a string`);
    if (message.direction !== "incoming" && message.direction !== "outgoing")
      fail(`${mPath}.direction must be incoming|outgoing`);
    if (typeof message.text !== "string") fail(`${mPath}.text must be a string`);
    if (!message.sent_at || typeof message.sent_at !== "string") fail(`${mPath}.sent_at must be an ISO string`);
    return {
      message_id: message.message_id,
      direction: message.direction,
      sender: String(message.sender || (message.direction === "outgoing" ? "Kelly" : customer.name)),
      text: message.text,
      sent_at: message.sent_at,
      attachment: String(message.attachment || ""),
    };
  });
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  const inquiryId =
    entry.inquiry_id ||
    `${account.channel}-${account.account_id}-${String(customer.name || index)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
  return {
    inquiry_id: inquiryId,
    account_id: account.account_id,
    channel: account.channel,
    customer: {
      name: customer.name,
      company: String(customer.company || ""),
      country: String(customer.country || "").toUpperCase(),
      source: String(customer.source || method),
    },
    product_interest: String(entry.product_interest || ""),
    product_ids: Array.isArray(entry.product_ids) ? entry.product_ids : [],
    quote_ids: Array.isArray(entry.quote_ids) ? entry.quote_ids : [],
    stage: STAGES.includes(entry.stage) ? entry.stage : "new",
    value_estimate: Number(entry.value_estimate) || 0,
    currency: String(entry.currency || config.quote_defaults?.currency || "USD"),
    owner: String(entry.owner || config.owner || "Kelly"),
    unread: entry.unread !== undefined ? Boolean(entry.unread) : Boolean(last && last.direction === "incoming"),
    created_at: String(entry.created_at || messages[0]?.sent_at || nowIso),
    last_message_at: last?.sent_at || "",
    last_incoming_at: lastIncoming?.sent_at || "",
    next_follow_up: String(entry.next_follow_up || ""),
    provider_conversation_id: String(entry.provider_conversation_id || ""),
    suggested_reply: String(entry.suggested_reply || ""),
    messages,
  };
});

const lock = await readLock();
if (lock) {
  console.error(`Ingest refused: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

await writeJson(LOCK_PATH, { owner: "kelly-inquiry", message: `Ingesting ${file}`, started_at: nowIso });
try {
  const snapshot = await readSnapshot();
  snapshot.source = "kelly-inquiry";
  snapshot.accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  snapshot.quotes = Array.isArray(snapshot.quotes) ? snapshot.quotes : [];
  snapshot.products = Array.isArray(snapshot.products) ? snapshot.products : [];
  snapshot.approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
  snapshot.sync_log = Array.isArray(snapshot.sync_log) ? snapshot.sync_log : [];
  snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
  const added = mergeInquiries(snapshot, inquiries);
  const owned = snapshot.inquiries.filter((item) => item.account_id === account.account_id);
  const existing = snapshot.accounts.find((item) => item.account_id === account.account_id);
  const patch = {
    account_id: account.account_id,
    channel: account.channel,
    connector: account.connector || method,
    display_name: account.display_name || account.account_id,
    handle: account.handle || "",
    status: "ok",
    inquiry_count: owned.length,
    unread_count: owned.filter((item) => item.unread).length,
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
    message: `Ingested ${inquiries.length} inquiries from ${file}.`,
    new_messages: added,
  });
  snapshot.sync_log = snapshot.sync_log.slice(-100);
  snapshot.generated_at = nowIso;
  recomputeMetrics(snapshot);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Ingested ${inquiries.length} inquiries (${added} new messages) into ${SNAPSHOT_PATH}`);
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
