#!/usr/bin/env node
// Single write-path for agent-browsed or manual message payloads, and for
// registering the account itself (onboarding). Parsing raw material (a
// WhatsApp Web session read by the browser skill, a WeChat/iMessage/LINE
// export, pasted text) into the structured payload shape documented in
// references/messenger-schema.md is LLM work the agent does in
// conversation — this script is the deterministic step that validates that
// payload and writes it into Busabase.
//
// Ported from the retired scripts/ingest_messages.ts: same validation rules,
// same conversation_id derivation, same message dedup-by-message_id
// semantics — only the storage target changed, from
// app/.data/messages_snapshot.json to Busabase records. The retired script
// required the account to already exist in config.accounts[]; since there is
// no local config file anymore, this script's optional `payload.account`
// field now plays that role (upserted into the accounts Base first), mirroring
// kelly-standup's ingest_updates.mjs optional payload.team/payload.members
// onboarding fields.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/ingest_messages.mjs <payload.json> [more-payloads.json...] [--apply]

Validates one or more message payloads (see references/messenger-schema.md)
and merges them into Busabase: upserts the account (if payload.account is
present), upserts conversations by conversation-id, and creates any message
rows not already present (deduplicated by message-id). Without --apply this
is a dry run that only validates and prints a summary.`);
}

function fail(message) {
  console.error(`kelly-messenger ingest: ${message}`);
  process.exit(1);
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

async function upsertRow(client, declared, existing, idField, idValue, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-messenger-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-messenger-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const payloadFiles = rawArgs.filter((arg) => !arg.startsWith("--"));
  if (!payloadFiles.length) fail("usage: node scripts/ingest_messages.mjs <payload.json> [...] [--apply]");

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
  const accountsById = new Map(accountRows.map((row) => [row.account_id, row]));
  const conversationsById = new Map(conversationRows.map((row) => [row.conversation_id, row]));
  const existingMessageIds = new Set(messageRows.map((row) => row.message_id));

  let accountsUpserted = 0;
  let conversationsUpserted = 0;
  let messagesCreated = 0;

  for (const file of payloadFiles) {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    if (!payload || typeof payload !== "object") fail(`${file} must contain a JSON payload object`);

    // Onboarding: optional account registration/update, mirroring the
    // retired config.accounts[] entry this replaces.
    if (payload.account) {
      const input = payload.account;
      if (!input.account_id || typeof input.account_id !== "string") fail(`${file} account.account_id is required`);
      const existing = accountsById.get(input.account_id);
      const fields = {
        account_id: input.account_id,
        platform: input.platform || existing?.platform || "",
        connector: input.connector || existing?.connector || "manual",
        display_name: input.display_name || existing?.display_name || input.account_id,
        workspace: input.workspace || existing?.workspace || "",
        status: existing?.status || "not_configured",
        channels: input.channels ? JSON.stringify(input.channels) : existing?.channels || "",
        bot_token_env: input.bot_token_env || existing?.bot_token_env || "",
        user_token_env: input.user_token_env || existing?.user_token_env || "",
        access_token_env: input.access_token_env || existing?.access_token_env || "",
        phone_number_id_env: input.phone_number_id_env || existing?.phone_number_id_env || "",
        phone_number_id: input.phone_number_id || existing?.phone_number_id || "",
        last_sync_at: existing?.last_sync_at || "",
      };
      await upsertRow(
        client,
        declared("accounts"),
        existing,
        "account-id",
        input.account_id,
        fields,
        `Upsert kelly-messenger account ${input.account_id}`,
        apply,
      );
      accountsById.set(input.account_id, { ...existing, __recordId: existing?.__recordId, ...fields });
      accountsUpserted += 1;
    }

    if (!Array.isArray(payload.conversations) || !payload.conversations.length) {
      console.log(`${file}: ${payload.account ? "account registered, " : ""}no conversations to ingest.`);
      continue;
    }

    const accountId = payload.account_id || payload.account?.account_id;
    if (!accountId || typeof accountId !== "string") fail(`${file}: account_id must be a string`);
    const account = accountsById.get(accountId);
    if (!account) fail(`${file}: account_id "${accountId}" is not registered; include payload.account first`);

    const method = payload.method === "manual" ? "manual" : "browser_agent";
    const nowIso = new Date().toISOString();
    let fileConversations = 0;
    let fileMessages = 0;

    for (const [index, conversation] of payload.conversations.entries()) {
      const path = `${file} conversations[${index}]`;
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
      const conversationId =
        conversation.conversation_id ||
        `${account.platform}-${account.account_id}-${String(conversation.title || index)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`;
      const existing = conversationsById.get(conversationId);
      const fields = {
        conversation_id: conversationId,
        account_id: account.account_id,
        platform: account.platform,
        kind: conversation.kind || existing?.kind || "dm",
        title: String(conversation.title || existing?.title || conversationId),
        channel: String(conversation.channel || existing?.channel || ""),
        workspace: String(conversation.workspace || existing?.workspace || account.workspace || ""),
        participants: JSON.stringify(
          Array.isArray(conversation.participants)
            ? conversation.participants
            : [...new Set(messages.map((message) => message.sender))],
        ),
        provider_conversation_id: String(
          conversation.provider_conversation_id || existing?.provider_conversation_id || "",
        ),
        suggested_reply: String(conversation.suggested_reply ?? existing?.suggested_reply ?? ""),
        unread: String(
          conversation.unread !== undefined ? Boolean(conversation.unread) : Boolean(last?.direction === "incoming"),
        ),
        awaiting_reply: String(
          conversation.awaiting_reply !== undefined
            ? Boolean(conversation.awaiting_reply)
            : Boolean(last?.direction === "incoming"),
        ),
      };
      await upsertRow(
        client,
        declared("conversations"),
        existing,
        "conversation-id",
        conversationId,
        fields,
        `Ingest conversation ${conversationId}`,
        apply,
      );
      conversationsById.set(conversationId, { ...existing, __recordId: existing?.__recordId, ...fields });
      fileConversations += 1;

      for (const message of messages) {
        if (existingMessageIds.has(message.message_id)) continue;
        await upsertRow(
          client,
          declared("messages"),
          null,
          "message-id",
          message.message_id,
          { conversation_id: conversationId, ...message },
          `Ingest message ${message.message_id}`,
          apply,
        );
        existingMessageIds.add(message.message_id);
        fileMessages += 1;
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
        status: "ok",
        channels: account.channels || "",
        bot_token_env: account.bot_token_env || "",
        user_token_env: account.user_token_env || "",
        access_token_env: account.access_token_env || "",
        phone_number_id_env: account.phone_number_id_env || "",
        phone_number_id: account.phone_number_id || "",
        last_sync_at: payload.collected_at || nowIso,
      },
      `Ingest status for account ${account.account_id}`,
      apply,
    );
    await upsertRow(
      client,
      declared("sync_log"),
      null,
      "sync-id",
      `ingest-${account.account_id}-${Date.now()}`,
      {
        sync_id: `ingest-${account.account_id}-${Date.now()}`,
        account_id: account.account_id,
        method,
        at: nowIso,
        status: "ok",
        message: `Ingested ${fileConversations} conversations from ${file}.`,
        new_messages: fileMessages,
      },
      `Ingest log for ${account.account_id}`,
      apply,
    );

    conversationsUpserted += fileConversations;
    messagesCreated += fileMessages;
    console.log(
      `${file}: ${fileConversations} conversation(s), ${fileMessages} new message(s) for ${accountId}${apply ? "" : " (dry run)"}`,
    );
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${accountsUpserted} account(s), ${conversationsUpserted} conversation(s), ${messagesCreated} message(s) to Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
