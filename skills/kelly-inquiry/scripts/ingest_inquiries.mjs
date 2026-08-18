#!/usr/bin/env node
// Single write-path for agent-collected or manual inquiry payloads, and for
// registering the account itself (onboarding). Parsing raw material (a
// WhatsApp/Instagram/Messenger webhook payload, an email handed off from
// kelly-email, a browser-collected transcript) into the structured payload
// shape documented in references/inquiry-schema.md is LLM work the agent
// does in conversation — this script is the deterministic step that
// validates that payload and writes it into Busabase.
//
// Ported from the retired scripts/ingest_inquiries.ts: same validation
// rules, same inquiry_id derivation, same message dedup-by-message_id
// semantics, and the same stage heuristic (refreshInquiryDerived, imported
// from app/app/js/inquiry-model.js so this script and the browser never
// drift apart) — only the storage target changed, from
// app/.data/inquiry_snapshot.json to Busabase records. The retired script
// required the account to already exist in config.accounts[]; since there is
// no local config file anymore, this script's optional `payload.account`
// field now plays that role (upserted into the accounts Base first),
// mirroring kelly-messenger's ingest_messages.mjs optional payload.account
// onboarding field.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { CONNECTORS, STAGES, refreshInquiryDerived } from "../app/app/js/inquiry-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_inquiries.mjs <payload.json> [more-payloads.json...] [--apply]

Validates one or more inquiry payloads (see references/inquiry-schema.md) and
merges them into Busabase: upserts the account (if payload.account is
present), upserts inquiries by inquiry-id (applying the new->replied stage
heuristic), and creates any message rows not already present (deduplicated
by message-id). Without --apply this is a dry run that only validates and
prints a summary.`);
}

function fail(message) {
  console.error(`kelly-inquiry ingest: ${message}`);
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
      author: "kelly-inquiry-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-inquiry-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const payloadFiles = rawArgs.filter((arg) => !arg.startsWith("--"));
  if (!payloadFiles.length) fail("usage: node scripts/ingest_inquiries.mjs <payload.json> [...] [--apply]");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Inquiry Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [accountRows, inquiryRows, messageRows] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("inquiries")),
    readAll(client, declared("messages")),
  ]);
  const accountsById = new Map(accountRows.map((row) => [row.account_id, row]));
  const inquiriesById = new Map(inquiryRows.map((row) => [row.inquiry_id, row]));
  const messagesByInquiry = new Map();
  for (const row of messageRows) {
    const key = row.inquiry_id || "";
    if (!messagesByInquiry.has(key)) messagesByInquiry.set(key, []);
    messagesByInquiry.get(key).push(row);
  }
  const existingMessageIds = new Set(messageRows.map((row) => row.message_id));

  let accountsUpserted = 0;
  let inquiriesUpserted = 0;
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
        channel: input.channel || existing?.channel || "",
        connector: input.connector || existing?.connector || "manual",
        display_name: input.display_name || existing?.display_name || input.account_id,
        handle: input.handle || existing?.handle || "",
        status: existing?.status || "not_configured",
        access_token_env: input.access_token_env || existing?.access_token_env || "",
        phone_number_id_env: input.phone_number_id_env || existing?.phone_number_id_env || "",
        phone_number_id: input.phone_number_id || existing?.phone_number_id || "",
        ig_user_id_env: input.ig_user_id_env || existing?.ig_user_id_env || "",
        page_id_env: input.page_id_env || existing?.page_id_env || "",
        last_sync_at: existing?.last_sync_at || "",
      };
      await upsertRow(
        client,
        declared("accounts"),
        existing,
        "account-id",
        input.account_id,
        fields,
        `Upsert kelly-inquiry account ${input.account_id}`,
        apply,
      );
      accountsById.set(input.account_id, { ...existing, __recordId: existing?.__recordId, ...fields });
      accountsUpserted += 1;
    }

    if (!payload.account_id || typeof payload.account_id !== "string") fail(`${file}.account_id must be a string`);
    if (!Array.isArray(payload.inquiries) || !payload.inquiries.length)
      fail(`${file}.inquiries must be a non-empty array`);
    const account = accountsById.get(payload.account_id);
    if (!account) fail(`${file}: account_id "${payload.account_id}" is not registered; include payload.account first`);

    const method = CONNECTORS.includes(payload.method) ? payload.method : account.connector || "manual";
    const nowIso = new Date().toISOString();
    let fileInquiries = 0;
    let fileMessages = 0;

    for (const [index, entry] of payload.inquiries.entries()) {
      const path = `${file} inquiries[${index}]`;
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

      const inquiryId =
        entry.inquiry_id ||
        `${account.channel}-${account.account_id}-${String(customer.name || index)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`;
      const existing = inquiriesById.get(inquiryId);

      // Merge messages: dedupe by message_id against everything already
      // stored for this inquiry, then re-run the stage heuristic on the
      // FULL merged message list (matches the retired mergeInquiries()'s
      // per-inquiry refreshInquiryDerived() call).
      const storedMessages = messagesByInquiry.get(inquiryId) || [];
      const mergedMessages = [...storedMessages];
      const seen = new Set(storedMessages.map((m) => m.message_id));
      const newMessages = [];
      for (const message of messages) {
        if (seen.has(message.message_id)) continue;
        mergedMessages.push(message);
        newMessages.push(message);
        seen.add(message.message_id);
      }
      mergedMessages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));

      const derived = refreshInquiryDerived({
        stage: entry.stage && STAGES.includes(entry.stage) ? entry.stage : existing?.stage || "new",
        messages: mergedMessages,
      });

      const fields = {
        inquiry_id: inquiryId,
        account_id: account.account_id,
        channel: account.channel,
        customer_name: customer.name || existing?.customer_name || "",
        customer_company: String(customer.company ?? existing?.customer_company ?? ""),
        customer_country: String(customer.country ?? existing?.customer_country ?? "").toUpperCase(),
        customer_source: String(customer.source ?? existing?.customer_source ?? method),
        product_interest: String(entry.product_interest ?? existing?.product_interest ?? ""),
        product_ids: JSON.stringify(Array.isArray(entry.product_ids) ? entry.product_ids : []),
        quote_ids: JSON.stringify(Array.isArray(entry.quote_ids) ? entry.quote_ids : []),
        stage: derived.stage,
        value_estimate:
          entry.value_estimate !== undefined ? Number(entry.value_estimate) || 0 : (existing?.value_estimate ?? 0),
        currency: String(entry.currency || existing?.currency || "USD"),
        owner: String(entry.owner || existing?.owner || "Kelly"),
        unread: String(
          entry.unread !== undefined
            ? Boolean(entry.unread)
            : mergedMessages[mergedMessages.length - 1]?.direction === "incoming",
        ),
        created_at: String(existing?.created_at || entry.created_at || mergedMessages[0]?.sent_at || nowIso),
        next_follow_up: String(entry.next_follow_up ?? existing?.next_follow_up ?? ""),
        provider_conversation_id: String(entry.provider_conversation_id ?? existing?.provider_conversation_id ?? ""),
        suggested_reply: String(entry.suggested_reply ?? existing?.suggested_reply ?? ""),
        updated_at: nowIso,
      };
      await upsertRow(
        client,
        declared("inquiries"),
        existing,
        "inquiry-id",
        inquiryId,
        fields,
        `Ingest inquiry ${inquiryId}`,
        apply,
      );
      inquiriesById.set(inquiryId, { ...existing, __recordId: existing?.__recordId, ...fields });
      messagesByInquiry.set(inquiryId, mergedMessages);
      fileInquiries += 1;

      for (const message of newMessages) {
        if (existingMessageIds.has(message.message_id)) continue;
        await upsertRow(
          client,
          declared("messages"),
          null,
          "message-id",
          message.message_id,
          { inquiry_id: inquiryId, ...message },
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
        channel: account.channel || "",
        connector: account.connector || method,
        display_name: account.display_name || account.account_id,
        handle: account.handle || "",
        status: "ok",
        access_token_env: account.access_token_env || "",
        phone_number_id_env: account.phone_number_id_env || "",
        phone_number_id: account.phone_number_id || "",
        ig_user_id_env: account.ig_user_id_env || "",
        page_id_env: account.page_id_env || "",
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
        message: `Ingested ${fileInquiries} inquiries from ${file}.`,
        new_messages: fileMessages,
      },
      `Ingest log for ${account.account_id}`,
      apply,
    );

    inquiriesUpserted += fileInquiries;
    messagesCreated += fileMessages;
    console.log(
      `${file}: ${fileInquiries} inquiry(ies), ${fileMessages} new message(s) for ${payload.account_id}${apply ? "" : " (dry run)"}`,
    );
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${accountsUpserted} account(s), ${inquiriesUpserted} inquiry(ies), ${messagesCreated} message(s) to Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
