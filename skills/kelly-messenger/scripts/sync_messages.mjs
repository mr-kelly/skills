#!/usr/bin/env node
// Read-only sync for API connectors: slack, discord, telegram, whatsapp_cloud.
// Uses only node builtins + global fetch to reach the real messaging
// platforms — the AirApp browser cannot do this (no secrets, no outbound
// platform calls). Ported from the retired scripts/sync_messages.ts:
// syncSlack/syncDiscord/syncTelegram/syncWhatsappCloud and baseConversation()
// are unchanged (same endpoints, same pagination, same id schemes); only the
// write target changed, from app/.data/messages_snapshot.json to Busabase's
// accounts/conversations/messages/sync_log Bases. Browser-collected platforms
// (WhatsApp Web, WeChat, iMessage) still go through scripts/ingest_messages.mjs.
//
// Accounts (roster, connector, channels[], and the *names* of the env vars
// holding tokens — never the tokens themselves) live in Busabase's accounts
// Base; they are created/updated via scripts/ingest_messages.mjs's optional
// `account` payload field during onboarding. This script only reads them.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { API_CONNECTORS, SECRET_ENV_KEYS } from "../app/app/js/messenger-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/sync_messages.mjs [--apply]

Reads accounts from Busabase, syncs new messages for every account whose
connector is slack/discord/telegram/whatsapp_cloud AND whose token env vars
are set, and merges the result into Busabase (accounts/conversations/
messages/sync_log). Without --apply this is a dry run that only prints a
summary of what would sync. Browser-collected platforms (browser_agent,
manual) are not handled here — use scripts/ingest_messages.mjs instead.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, idField, idValue, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-messenger-sync",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-messenger-sync",
    autoMerge: true,
  });
  return "created";
}

function missingEnvs(account) {
  return SECRET_ENV_KEYS.filter((key) => account[key])
    .map((key) => account[key])
    .filter((name) => !process.env[name]);
}

function parseChannels(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url.split("?")[0]} -> HTTP ${res.status}`);
  return body;
}

// ---- Connector adapters, ported verbatim from the retired sync_messages.ts ----

async function syncSlack(account) {
  const token = process.env[account.bot_token_env || account.user_token_env];
  const headers = { authorization: `Bearer ${token}` };
  const auth = await fetchJson("https://slack.com/api/auth.test", { method: "POST", headers });
  if (!auth.ok) throw new Error(`Slack auth.test failed: ${auth.error}`);
  const selfId = auth.user_id;
  let channelIds = parseChannels(account.channels);
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
  const channelIds = parseChannels(account.channels);
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
  return {
    conversation_id: conversationId,
    account_id: account.account_id,
    platform: account.platform,
    kind,
    title: title || channel || conversationId,
    channel,
    workspace: account.workspace || "",
    participants: [...new Set(messages.map((message) => message.sender))],
    unread: Boolean(messages.length && messages[messages.length - 1].direction === "incoming"),
    awaiting_reply: Boolean(messages.length && messages[messages.length - 1].direction === "incoming"),
    provider_conversation_id: providerConversationId,
    suggested_reply: "",
    messages,
  };
}

async function syncAccount(account) {
  if (account.connector === "slack") return syncSlack(account);
  if (account.connector === "discord") return syncDiscord(account);
  if (account.connector === "telegram") return syncTelegram(account);
  if (account.connector === "whatsapp_cloud") return syncWhatsappCloud(account);
  throw new Error(`Unsupported connector: ${account.connector}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Messenger Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [accountRows, conversationRows, messageRows] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("conversations")),
    readAll(client, declared("messages")),
  ]);
  const accounts = accountRows.filter((account) => API_CONNECTORS.has(account.connector));

  if (!accounts.length) {
    console.log("Kelly Messenger sync: no API-connector accounts configured yet.");
    console.log("Register one via scripts/ingest_messages.mjs's optional `account` payload field,");
    console.log("declare connector slack/discord/telegram/whatsapp_cloud, and put tokens in env files.");
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

  const conversationsById = new Map(conversationRows.map((row) => [row.conversation_id, row]));
  const existingMessageIds = new Set(messageRows.map((row) => row.message_id));
  const nowIso = new Date().toISOString();

  let totalConversations = 0;
  let totalNewMessages = 0;

  for (const account of ready) {
    let result;
    let status = "ok";
    let logMessage;
    try {
      result = await syncAccount(account);
      logMessage = result.note || `Synced ${result.conversations.length} conversations.`;
    } catch (error) {
      status = "warning";
      logMessage = error.message;
      result = { conversations: [] };
    }

    let newMessages = 0;
    for (const conversation of result.conversations) {
      const existing = conversationsById.get(conversation.conversation_id);
      await upsertRow(
        client,
        declared("conversations"),
        existing,
        "conversation-id",
        conversation.conversation_id,
        {
          conversation_id: conversation.conversation_id,
          account_id: conversation.account_id,
          platform: conversation.platform,
          kind: conversation.kind,
          title: conversation.title,
          channel: conversation.channel,
          workspace: conversation.workspace,
          participants: JSON.stringify(conversation.participants),
          provider_conversation_id: conversation.provider_conversation_id,
          suggested_reply: existing?.suggested_reply || conversation.suggested_reply,
          unread: String(conversation.unread),
          awaiting_reply: String(conversation.awaiting_reply),
        },
        `Sync conversation ${conversation.conversation_id}`,
        apply,
      );
      conversationsById.set(conversation.conversation_id, { conversation_id: conversation.conversation_id });

      for (const message of conversation.messages) {
        if (existingMessageIds.has(message.message_id)) continue;
        await upsertRow(
          client,
          declared("messages"),
          null,
          "message-id",
          message.message_id,
          { conversation_id: conversation.conversation_id, ...message },
          `Sync message ${message.message_id}`,
          apply,
        );
        existingMessageIds.add(message.message_id);
        newMessages += 1;
      }
    }

    await upsertRow(
      client,
      declared("accounts"),
      account,
      "account-id",
      account.account_id,
      {
        account_id: account.account_id,
        platform: account.platform || "",
        connector: account.connector || "",
        display_name: account.display_name || "",
        workspace: account.workspace || "",
        status,
        channels: account.channels || "",
        bot_token_env: account.bot_token_env || "",
        user_token_env: account.user_token_env || "",
        access_token_env: account.access_token_env || "",
        phone_number_id_env: account.phone_number_id_env || "",
        phone_number_id: account.phone_number_id || "",
        last_sync_at: nowIso,
      },
      `Sync status for account ${account.account_id}`,
      apply,
    );
    await upsertRow(
      client,
      declared("sync_log"),
      null,
      "sync-id",
      `sync-${account.account_id}-${Date.now()}`,
      {
        sync_id: `sync-${account.account_id}-${Date.now()}`,
        account_id: account.account_id,
        method: account.connector,
        at: nowIso,
        status,
        message: logMessage,
        new_messages: newMessages,
      },
      `Sync log for ${account.account_id}`,
      apply,
    );

    totalConversations += result.conversations.length;
    totalNewMessages += newMessages;
    console.log(
      `${apply ? "Synced" : "Would sync"} ${account.account_id}: ${result.conversations.length} conversations, ${newMessages} new messages (${status}). ${logMessage}`,
    );
  }

  for (const { account, missing } of skipped) {
    console.log(`Skipped ${account.account_id}: missing ${missing.join(", ")}.`);
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${totalConversations} conversation(s), ${totalNewMessages} new message(s) to Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
