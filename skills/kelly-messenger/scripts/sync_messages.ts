#!/usr/bin/env node
// Read-only sync for API connectors: slack, discord, telegram, whatsapp_cloud.
// Uses only node builtins + global fetch. Browser-collected platforms go
// through scripts/ingest_messages.mjs instead.
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.ts";
import {
  SECRET_ENV_KEYS,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  mergeConversations,
  readConfig,
  readLock,
  readSnapshot,
  recomputeMetrics,
  writeJson,
} from "../app/server/store.ts";

const API_CONNECTORS = new Set(["slack", "discord", "telegram", "whatsapp_cloud"]);

function nowIso() {
  return new Date().toISOString();
}

function missingEnvs(account) {
  return SECRET_ENV_KEYS.filter((key) => account[key])
    .map((key) => account[key])
    .filter((name) => !process.env[name]);
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const { config, path: configPath, is_example } = await readConfig();
  const accounts = (config.accounts || []).filter((account) => API_CONNECTORS.has(account.connector));

  if (!accounts.length || is_example || !configPath) {
    console.log("Kelly Messenger sync: no API-connector accounts configured yet.");
    console.log("Copy config.example.json to config.local.json (or ~/.config/kelly-messenger/config.json),");
    console.log("declare accounts with connector slack/discord/telegram/whatsapp_cloud, and put tokens in env files.");
    console.log(
      "Browser-collected platforms (WhatsApp Web, WeChat, iMessage) use scripts/ingest_messages.mjs instead.",
    );
    return;
  }

  const ready = [];
  const skipped = [];
  for (const account of accounts) {
    const missing = missingEnvs(account);
    if (missing.length) skipped.push({ account, missing });
    else ready.push(account);
  }

  if (!ready.length) {
    console.log("Kelly Messenger sync: no connector tokens found, nothing was synced.");
    for (const { account, missing } of skipped) {
      console.log(`  - ${account.account_id} (${account.platform}/${account.connector}): set ${missing.join(", ")}`);
    }
    console.log("Add the missing variables to a local env file (never commit them), then run this script again.");
    return;
  }

  const lock = await readLock();
  if (lock) {
    console.error(
      `Kelly Messenger sync: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}). Try again later.`,
    );
    process.exitCode = 1;
    return;
  }

  await writeJson(LOCK_PATH, {
    owner: "kelly-messenger",
    message: "Syncing messages from API connectors",
    started_at: nowIso(),
  });
  try {
    const snapshot = await readSnapshot();
    snapshot.source = "kelly-messenger";
    snapshot.accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    snapshot.sync_log = Array.isArray(snapshot.sync_log) ? snapshot.sync_log : [];
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");

    for (const account of ready) {
      const startedAt = nowIso();
      try {
        const result = await syncAccount(account);
        const added = mergeConversations(snapshot, result.conversations);
        upsertAccount(snapshot, account, added, startedAt, "ok");
        snapshot.sync_log.push({
          sync_id: `sync-${account.account_id}-${Date.now()}`,
          account_id: account.account_id,
          method: account.connector,
          at: startedAt,
          status: "ok",
          message: result.note || `Synced ${result.conversations.length} conversations.`,
          new_messages: added,
        });
        console.log(
          `Synced ${account.account_id}: ${result.conversations.length} conversations, ${added} new messages.`,
        );
      } catch (error) {
        upsertAccount(snapshot, account, 0, startedAt, "warning");
        snapshot.sync_log.push({
          sync_id: `sync-${account.account_id}-${Date.now()}`,
          account_id: account.account_id,
          method: account.connector,
          at: startedAt,
          status: "error",
          message: error.message,
          new_messages: 0,
        });
        console.error(`Sync failed for ${account.account_id}: ${error.message}`);
      }
    }

    snapshot.sync_log = snapshot.sync_log.slice(-100);
    snapshot.generated_at = nowIso();
    recomputeMetrics(snapshot);
    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

function upsertAccount(snapshot, account, added, at, status) {
  const conversations = snapshot.conversations || [];
  const owned = conversations.filter((item) => item.account_id === account.account_id);
  const existing = snapshot.accounts.find((item) => item.account_id === account.account_id);
  const patch = {
    account_id: account.account_id,
    platform: account.platform,
    connector: account.connector,
    display_name: account.display_name || account.account_id,
    workspace: account.workspace || "",
    status,
    unread_count: owned.filter((item) => item.unread).length,
    conversation_count: owned.length,
    last_sync_at: at,
  };
  if (existing) Object.assign(existing, patch);
  else snapshot.accounts.push(patch);
}

async function syncAccount(account) {
  if (account.connector === "slack") return syncSlack(account);
  if (account.connector === "discord") return syncDiscord(account);
  if (account.connector === "telegram") return syncTelegram(account);
  if (account.connector === "whatsapp_cloud") return syncWhatsappCloud(account);
  throw new Error(`Unsupported connector: ${account.connector}`);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url.split("?")[0]} -> HTTP ${res.status}`);
  return body;
}

async function syncSlack(account) {
  const token = process.env[account.bot_token_env || account.user_token_env];
  const headers = { authorization: `Bearer ${token}` };
  const auth = await fetchJson("https://slack.com/api/auth.test", { method: "POST", headers });
  if (!auth.ok) throw new Error(`Slack auth.test failed: ${auth.error}`);
  const selfId = auth.user_id;
  let channelIds = account.channels || [];
  if (!channelIds.length) {
    const list = await fetchJson(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel,im&limit=100",
      { headers },
    );
    if (!list.ok) throw new Error(`Slack conversations.list failed: ${list.error}`);
    channelIds = (list.channels || [])
      .filter((channel) => channel.is_member || channel.is_im)
      .slice(0, 20)
      .map((channel) => channel.id);
  }
  const conversations = [];
  for (const channelId of channelIds) {
    const history = await fetchJson(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=50`,
      { headers },
    );
    if (!history.ok) throw new Error(`Slack conversations.history failed for ${channelId}: ${history.error}`);
    const messages = (history.messages || [])
      .filter((message) => message.type === "message" && message.text)
      .reverse()
      .map((message) => ({
        message_id: `slack-${channelId}-${message.ts}`,
        direction: message.user === selfId ? "outgoing" : "incoming",
        sender: message.user === selfId ? "Kelly" : message.username || message.user || "unknown",
        text: message.text,
        sent_at: new Date(Number.parseFloat(message.ts) * 1000).toISOString(),
        attachment: message.files?.length ? `file: ${message.files[0].name}` : "",
      }));
    if (!messages.length) continue;
    conversations.push(
      baseConversation(
        account,
        `slack-${account.account_id}-${channelId}`,
        channelId,
        "channel",
        `#${channelId}`,
        messages,
      ),
    );
  }
  return { conversations, note: `${channelIds.length} channels scanned via conversations.history.` };
}

async function syncDiscord(account) {
  const token = process.env[account.bot_token_env];
  const headers = { authorization: `Bot ${token}` };
  const me = await fetchJson("https://discord.com/api/v10/users/@me", { headers });
  const channelIds = account.channels || [];
  if (!channelIds.length) throw new Error("Discord accounts need a channels[] list of channel ids to watch.");
  const conversations = [];
  for (const channelId of channelIds) {
    const channel = await fetchJson(`https://discord.com/api/v10/channels/${channelId}`, { headers });
    const raw = await fetchJson(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, { headers });
    const messages = raw
      .filter((message) => message.content)
      .reverse()
      .map((message) => ({
        message_id: `discord-${channelId}-${message.id}`,
        direction: message.author?.id === me.id ? "outgoing" : "incoming",
        sender:
          message.author?.id === me.id ? "Kelly" : message.author?.global_name || message.author?.username || "unknown",
        text: message.content,
        sent_at: message.timestamp,
        attachment: message.attachments?.length ? `file: ${message.attachments[0].filename}` : "",
      }));
    if (!messages.length) continue;
    conversations.push(
      baseConversation(
        account,
        `discord-${account.account_id}-${channelId}`,
        channelId,
        channel.type === 1 ? "dm" : "channel",
        channel.name ? `#${channel.name}` : "",
        messages,
      ),
    );
  }
  return { conversations, note: `${channelIds.length} channels scanned via REST.` };
}

async function syncTelegram(account) {
  const token = process.env[account.bot_token_env];
  const me = await fetchJson(`https://api.telegram.org/bot${token}/getMe`);
  if (!me.ok) throw new Error("Telegram getMe failed");
  const updates = await fetchJson(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
  if (!updates.ok) throw new Error("Telegram getUpdates failed");
  const byChat = new Map();
  for (const update of updates.result || []) {
    const message = update.message || update.channel_post;
    if (!message?.text) continue;
    const chat = message.chat;
    const key = String(chat.id);
    if (!byChat.has(key)) byChat.set(key, { chat, messages: [] });
    byChat.get(key).messages.push({
      message_id: `telegram-${chat.id}-${message.message_id}`,
      direction: message.from?.id === me.result.id ? "outgoing" : "incoming",
      sender: message.from?.id === me.result.id ? "Kelly" : message.from?.first_name || chat.title || "unknown",
      text: message.text,
      sent_at: new Date(message.date * 1000).toISOString(),
      attachment: "",
    });
  }
  const conversations = [...byChat.values()].map(({ chat, messages }) =>
    baseConversation(
      account,
      `telegram-${account.account_id}-${chat.id}`,
      String(chat.id),
      chat.type === "private" ? "dm" : "group",
      "",
      messages,
      chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" "),
    ),
  );
  return { conversations, note: "getUpdates drained. Note: the bot must share the chats it should read." };
}

async function syncWhatsappCloud(account) {
  const token = process.env[account.access_token_env];
  const phoneNumberId = process.env[account.phone_number_id_env] || account.phone_number_id || "";
  if (!phoneNumberId) throw new Error("WhatsApp Cloud accounts need phone_number_id or phone_number_id_env.");
  // Verify credentials; the Cloud API delivers inbound messages via webhooks only,
  // so history collection happens through ingest payloads or a webhook relay.
  await fetchJson(`https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    conversations: [],
    note: "Credentials verified. WhatsApp Cloud API is webhook-based: ingest collected payloads via scripts/ingest_messages.mjs.",
  };
}

function baseConversation(account, conversationId, providerConversationId, kind, channel, messages, title = "") {
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  return {
    conversation_id: conversationId,
    account_id: account.account_id,
    platform: account.platform,
    kind,
    title: title || channel || conversationId,
    channel,
    workspace: account.workspace || "",
    participants: [...new Set(messages.map((message) => message.sender))],
    unread: Boolean(last && last.direction === "incoming"),
    awaiting_reply: Boolean(last && last.direction === "incoming"),
    provider_conversation_id: providerConversationId,
    last_message_at: last?.sent_at || "",
    last_incoming_at: lastIncoming?.sent_at || "",
    suggested_reply: "",
    messages,
  };
}

await main();
