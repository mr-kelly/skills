#!/usr/bin/env node
// Executes APPROVED outbox replies. Dry-run by default; pass --send for real
// sends. Re-reads Busabase immediately before sending so a reply approved
// (or unapproved) after the dry-run plan was built is respected. API
// connectors (slack/discord/telegram/whatsapp_cloud) send via global fetch —
// the AirApp browser cannot do this (no secrets, no outbound platform
// calls); browser_agent and manual connectors become handoff_to_agent
// operations for the agent to deliver through the user's own session.
// planFor/sendVia/postJson are ported verbatim from the retired
// scripts/send_outbox.ts; only the read/write target changed, from
// content/kelly-messenger-app/.data/outbox.json + content/kelly-messenger-app/.data/messages_snapshot.json to Busabase's
// replies/conversations/accounts Bases.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-messenger-app/app/js/config.js";
import { API_CONNECTORS } from "../content/kelly-messenger-app/app/js/messenger-model.js";

function help() {
  console.log(`Usage: node scripts/send_outbox.mjs [--send]

Reads replies with status "approved" from Busabase and prints a send plan
(connector, target, operation). Without --send this is a dry run. With
--send it re-reads Busabase immediately before sending, sends API-connector
replies via the official APIs, marks browser_agent/manual replies as
handoff_to_agent for the agent to deliver, and writes the execution result
plus status "done" back onto each reply record.`);
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

function truncate(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tokenEnvFor(account) {
  if (account.connector === "whatsapp_cloud") return account.access_token_env || "";
  return account.bot_token_env || account.user_token_env || "";
}

function planFor(reply, conversationsById, accountsById) {
  const account = accountsById.get(reply.account_id);
  const conversation = conversationsById.get(reply.conversation_id);
  const connector = account?.connector || "manual";
  const target = conversation?.provider_conversation_id || "";
  const plan = {
    reply,
    account,
    conversation,
    connector,
    target,
    operation: API_CONNECTORS.has(connector) ? "send_message" : "handoff_to_agent",
    blocker: "",
  };
  if (!account) plan.blocker = `Account ${reply.account_id} is not in Busabase.`;
  else if (API_CONNECTORS.has(connector)) {
    if (!conversation) plan.blocker = `Conversation ${reply.conversation_id} is not in Busabase.`;
    else if (!target) plan.blocker = "Conversation has no provider_conversation_id target.";
    else {
      const envName = tokenEnvFor(account);
      if (!envName || !process.env[envName]) plan.blocker = `Missing token env ${envName || "(none declared)"}.`;
    }
  }
  return plan;
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      `${url.split("?")[0]} -> HTTP ${res.status}${body.error ? ` (${JSON.stringify(body.error)})` : ""}`,
    );
  return body;
}

async function sendVia(plan) {
  const token = process.env[tokenEnvFor(plan.account)];
  const text = plan.reply.text;
  if (plan.connector === "slack") {
    const channel = plan.target.split("/")[0];
    const body = await postJson(
      "https://slack.com/api/chat.postMessage",
      { channel, text },
      { authorization: `Bearer ${token}` },
    );
    if (!body.ok) throw new Error(`Slack chat.postMessage failed: ${body.error}`);
    return;
  }
  if (plan.connector === "discord") {
    const channel = plan.target.replace(/^(chan|dm|thread)\//, "");
    await postJson(
      `https://discord.com/api/v10/channels/${channel}/messages`,
      { content: text },
      { authorization: `Bot ${token}` },
    );
    return;
  }
  if (plan.connector === "telegram") {
    const body = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: plan.target, text });
    if (!body.ok) throw new Error(`Telegram sendMessage failed: ${body.description || "unknown"}`);
    return;
  }
  if (plan.connector === "whatsapp_cloud") {
    const phoneNumberId = process.env[plan.account.phone_number_id_env] || plan.account.phone_number_id || "";
    if (!phoneNumberId) throw new Error("Missing phone_number_id for WhatsApp Cloud send.");
    const to = plan.target.replace(/@wa$/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  throw new Error(`Unsupported connector: ${plan.connector}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const send = args.has("--send");

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

  const [replyRows, conversationRows, accountRows] = await Promise.all([
    readAll(client, declared("replies")),
    readAll(client, declared("conversations")),
    readAll(client, declared("accounts")),
  ]);
  const conversationsById = new Map(conversationRows.map((row) => [row.conversation_id, row]));
  const accountsById = new Map(accountRows.map((row) => [row.account_id, row]));
  const approved = replyRows.filter((row) => row.status === "approved");

  if (!approved.length) {
    console.log("Send outbox: no approved replies to send. Approve replies in the app's Outbox view first.");
    return;
  }

  const plans = approved.map((reply) => planFor(reply, conversationsById, accountsById));

  console.log(`${send ? "SEND" : "DRY-RUN"}: ${approved.length} approved repl${approved.length === 1 ? "y" : "ies"}`);
  for (const plan of plans) {
    console.log(
      `  - Reply ${plan.reply.reply_id} [${plan.reply.platform}] -> ${plan.target || "(no target)"} via ${plan.operation}`,
    );
    console.log(`      "${truncate(plan.reply.text)}"`);
    if (plan.blocker) console.log(`      blocker: ${plan.blocker}`);
  }

  if (!send) {
    console.log("Dry-run only. Re-run with --send to execute approved replies.");
    return;
  }

  // Re-read immediately before sending: approvals may have changed.
  const freshReplies = await readAll(client, declared("replies"));
  const freshById = new Map(freshReplies.map((row) => [row.reply_id, row]));
  const nowIso = () => new Date().toISOString();
  const results = [];

  // Only known field slugs are ever written back — never spread a raw row
  // (it also carries __recordId/__headCommitId bookkeeping keys that must
  // not be sent as Busabase fields).
  function baseReplyFields(row) {
    return {
      reply_id: row.reply_id,
      conversation_id: row.conversation_id || "",
      account_id: row.account_id || "",
      platform: row.platform || "",
      conversation_title: row.conversation_title || "",
      text: row.text || "",
      note: row.note || "",
      reason: row.reason || "",
      suggested_by: row.suggested_by || "",
      status: row.status || "needs_review",
      decision_action: row.decision_action || "",
      decision_comment: row.decision_comment || "",
      decided_at: row.decided_at || "",
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
    };
  }

  async function writeExecution(fresh, patch, message) {
    await client.records.changeRequest({
      recordId: fresh.__recordId,
      operation: "update",
      fields: toBusabaseFields({ ...baseReplyFields(fresh), ...patch }),
      message,
      author: "kelly-messenger-sender",
      baseCommitId: fresh.__headCommitId,
      autoMerge: true,
    });
  }

  for (const plan of plans) {
    const fresh = freshById.get(plan.reply.reply_id);
    if (!fresh || fresh.status !== "approved") {
      results.push({ reply_id: plan.reply.reply_id, status: "skipped", detail: "No longer approved at send time." });
      continue;
    }
    if (plan.blocker) {
      await writeExecution(
        fresh,
        {
          execution_status: "error",
          execution_operation: plan.operation,
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: plan.blocker,
          executed_at: nowIso(),
        },
        `Send failed for ${plan.reply.reply_id}`,
      );
      results.push({ reply_id: plan.reply.reply_id, status: "error", detail: plan.blocker });
      continue;
    }
    if (plan.operation === "handoff_to_agent") {
      const detail = `Agent must deliver this reply via the ${plan.reply.platform} ${plan.connector} flow.`;
      await writeExecution(
        fresh,
        {
          status: "done",
          execution_status: "handoff",
          execution_operation: "handoff_to_agent",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: detail,
          executed_at: nowIso(),
          updated_at: nowIso(),
        },
        `Hand off reply ${plan.reply.reply_id} to the agent`,
      );
      results.push({ reply_id: plan.reply.reply_id, status: "handoff", detail });
      continue;
    }
    try {
      await sendVia(plan);
      await writeExecution(
        fresh,
        {
          status: "done",
          execution_status: "executed",
          execution_operation: "send_message",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: `Sent via ${plan.connector}.`,
          executed_at: nowIso(),
          updated_at: nowIso(),
        },
        `Send reply ${plan.reply.reply_id}`,
      );
      results.push({ reply_id: plan.reply.reply_id, status: "executed", detail: `Sent via ${plan.connector}.` });
      console.log(`Sent ${plan.reply.reply_id} via ${plan.connector}.`);
    } catch (error) {
      await writeExecution(
        fresh,
        {
          execution_status: "error",
          execution_operation: "send_message",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: error.message,
          executed_at: nowIso(),
        },
        `Send error for ${plan.reply.reply_id}`,
      );
      results.push({ reply_id: plan.reply.reply_id, status: "error", detail: error.message });
      console.error(`${plan.reply.reply_id} failed: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ executed_at: nowIso(), results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
