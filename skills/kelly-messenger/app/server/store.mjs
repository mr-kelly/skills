import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  OUTBOX_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH
} from "./paths.mjs";

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readSnapshot() {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readOutbox() {
  return readJson(OUTBOX_PATH, emptyOutbox());
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export async function readAgentTasks() {
  return readJson(AGENT_TASKS_PATH, { schema_version: "1", updated_at: "", tasks: [] });
}

export async function readExecutionReport() {
  return readJson(EXECUTION_REPORT_PATH, null);
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-messenger",
    metrics: {
      account_count: 0,
      conversation_count: 0,
      message_count: 0,
      unread_count: 0,
      awaiting_reply_count: 0
    },
    accounts: [],
    conversations: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No message snapshot exists yet. Configure accounts, then run scripts/sync_messages.mjs or ingest a collected payload."
      }
    ]
  };
}

export function emptyOutbox() {
  return {
    schema_version: "1",
    updated_at: new Date(0).toISOString(),
    replies: []
  };
}

export function recomputeMetrics(snapshot) {
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    conversation_count: conversations.length,
    message_count: conversations.reduce((sum, item) => sum + (item.messages?.length || 0), 0),
    unread_count: conversations.filter((item) => item.unread).length,
    awaiting_reply_count: conversations.filter((item) => item.awaiting_reply).length
  };
  return snapshot;
}

export function mergeConversations(snapshot, incoming = []) {
  const byId = new Map((snapshot.conversations || []).map((item) => [item.conversation_id, item]));
  let newMessages = 0;
  for (const conversation of incoming) {
    const existing = byId.get(conversation.conversation_id);
    if (!existing) {
      byId.set(conversation.conversation_id, { ...conversation, messages: [...(conversation.messages || [])] });
      newMessages += conversation.messages?.length || 0;
      continue;
    }
    const seen = new Set((existing.messages || []).map((message) => message.message_id));
    for (const message of conversation.messages || []) {
      if (seen.has(message.message_id)) continue;
      existing.messages.push(message);
      seen.add(message.message_id);
      newMessages += 1;
    }
    existing.messages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    for (const key of ["title", "kind", "channel", "workspace", "provider_conversation_id", "participants"]) {
      if (conversation[key] !== undefined) existing[key] = conversation[key];
    }
    if (conversation.unread !== undefined) existing.unread = conversation.unread;
    if (conversation.awaiting_reply !== undefined) existing.awaiting_reply = conversation.awaiting_reply;
    if (conversation.suggested_reply !== undefined) existing.suggested_reply = conversation.suggested_reply;
    const last = existing.messages[existing.messages.length - 1];
    if (last) existing.last_message_at = last.sent_at;
    const lastIncoming = [...existing.messages].reverse().find((message) => message.direction === "incoming");
    if (lastIncoming) existing.last_incoming_at = lastIncoming.sent_at;
  }
  snapshot.conversations = [...byId.values()].sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
  return newMessages;
}

export async function queueReply({ conversation_id, text, note = "", suggested_by = "human" }) {
  const [snapshot, outbox] = await Promise.all([readSnapshot(), readOutbox()]);
  const conversation = (snapshot.conversations || []).find((item) => item.conversation_id === conversation_id);
  if (!conversation) throw new Error(`Unknown conversation: ${conversation_id}`);
  if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
  const now = new Date().toISOString();
  const ref = outbox.replies.reduce((max, reply) => Math.max(max, reply.ref || 0), 0) + 1;
  const reply = {
    reply_id: `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${ref}`,
    ref,
    conversation_id,
    account_id: conversation.account_id,
    platform: conversation.platform,
    conversation_title: conversation.title,
    text: text.trim(),
    note: String(note || ""),
    reason: "Queued from the inbox composer.",
    suggested_by,
    status: "needs_review",
    decision: null,
    execution: null,
    created_at: now,
    updated_at: now
  };
  outbox.replies.push(reply);
  outbox.updated_at = now;
  await writeJson(OUTBOX_PATH, outbox);
  return reply;
}

export async function decideReply({ reply_id, action, comment = "", text }) {
  const outbox = await readOutbox();
  const reply = outbox.replies.find((item) => item.reply_id === reply_id);
  if (!reply) throw new Error(`Unknown reply: ${reply_id}`);
  const now = new Date().toISOString();
  if (typeof text === "string" && text.trim()) reply.text = text.trim();
  if (action === "approve") reply.status = "approved";
  else if (action === "request_changes") reply.status = "changes_requested";
  else if (action === "block") reply.status = "blocked";
  else if (action !== "revise") throw new Error(`Unknown action: ${action}`);
  reply.decision = { action, comment: String(comment || ""), decided_at: now };
  reply.updated_at = now;
  outbox.updated_at = now;
  await writeJson(OUTBOX_PATH, outbox);
  if (action === "request_changes") await appendAgentTask(reply, comment);
  return reply;
}

async function appendAgentTask(reply, comment) {
  const tasks = await readAgentTasks();
  const now = new Date().toISOString();
  tasks.tasks.push({
    task_id: `task-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${reply.ref}`,
    type: "revise_reply",
    reply_id: reply.reply_id,
    ref: reply.ref,
    conversation_id: reply.conversation_id,
    comment: String(comment || ""),
    status: "open",
    requested_at: now
  });
  tasks.updated_at = now;
  await writeJson(AGENT_TASKS_PATH, tasks);
}

export async function loadDotenvFiles(files) {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_MESSENGER_CONFIG) paths.push(process.env.KELLY_MESSENGER_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-messenger", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_MESSENGER_ENV_FILE) paths.push(process.env.KELLY_MESSENGER_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-messenger", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export const SECRET_ENV_KEYS = ["bot_token_env", "user_token_env", "access_token_env", "phone_number_id_env", "token_env", "api_key_env"];

export function summarizeConfig(configResult) {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    reply_style: configResult.config.reply_style || null,
    sync: configResult.config.sync || null,
    accounts: accounts.map((account) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => account[key]);
      return {
        account_id: account.account_id || "",
        platform: account.platform || "",
        connector: account.connector || "manual",
        display_name: account.display_name || account.account_id || "",
        workspace: account.workspace || "",
        secret_envs: secretKeys.map((key) => account[key]),
        secrets_ready: secretKeys.length > 0 && secretKeys.every((key) => Boolean(process.env[account[key]]))
      };
    })
  };
}
