#!/usr/bin/env node
// Single write-path for raw feedback. Takes one or more payload JSON files
// (from sibling skills' agents, platform exports, or manual notes), validates
// them, dedupes by source id, and merges into Busabase. Ported from the
// retired scripts/ingest_feedback.ts: same validation rules, same
// `fb-<source_id>-<external_id>` feedback_id derivation, same dedupe-by-id
// idempotent re-ingest semantics — only the storage target changed, from
// content/kelly-feedback-app/.data/feedback_snapshot.json to Busabase's products/sources/feedback
// Bases. The retired script's source registration is now folded into this
// script's `payload.source` field (always present, upserted first); an
// optional `payload.products[]` field additionally upserts product catalog
// entries, mirroring kelly-messenger's ingest_messages.mjs optional
// `payload.account` onboarding field (there is no local config.local.json
// left to hold products/sources, so ingest is also how they get registered).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-feedback-app/app/js/config.js";

const CHANNELS = ["email", "discord", "slack", "x", "appstore", "survey", "interview"];
const SENTIMENTS = ["positive", "neutral", "negative"];

function help() {
  console.log(`Usage: node scripts/ingest_feedback.mjs <payload.json> [more.json ...] [--apply]

Validates one or more feedback payloads (see references/feedback-schema.md)
and merges them into Busabase: upserts payload.source (and any
payload.products[]), then creates any feedback item not already present
(deduplicated by "fb-<source_id>-<external_id>"). Without --apply this is a
dry run that only validates and prints a summary.`);
}

function fail(message) {
  console.error(`kelly-feedback ingest: ${message}`);
  process.exit(1);
}

function sanitizeId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validatePayload(payload, file) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail(`${file}: payload must be an object`);
  const source = payload.source;
  if (!source || typeof source !== "object") fail(`${file}: payload.source must be an object`);
  if (!source.source_id) fail(`${file}: payload.source.source_id is required`);
  if (!CHANNELS.includes(source.channel)) fail(`${file}: payload.source.channel must be one of ${CHANNELS.join("|")}`);
  if (!Array.isArray(payload.items) || !payload.items.length) fail(`${file}: payload.items must be a non-empty array`);
  payload.items.forEach((item, index) => {
    const path = `${file}: items[${index}]`;
    if (!item.external_id) fail(`${path}.external_id is required`);
    if (!item.text || typeof item.text !== "string") fail(`${path}.text must be a non-empty string`);
    if (!item.received_at || Number.isNaN(new Date(item.received_at).getTime()))
      fail(`${path}.received_at must be an ISO timestamp`);
    if (item.sentiment && !SENTIMENTS.includes(item.sentiment))
      fail(`${path}.sentiment must be one of ${SENTIMENTS.join("|")}`);
  });
}

function normalizeItem(payload, item) {
  const sourceId = sanitizeId(payload.source.source_id);
  return {
    feedback_id: `fb-${sourceId}-${sanitizeId(item.external_id)}`,
    source_id: sourceId,
    channel: item.channel && CHANNELS.includes(item.channel) ? item.channel : payload.source.channel,
    product: String(item.product || ""),
    user_handle: String(item.user?.handle || "unknown"),
    user_plan: String(item.user?.plan || ""),
    user_tenure_months: Number(item.user?.tenure_months || 0),
    user_weight: Number(item.user?.weight || 1),
    text: String(item.text),
    sentiment: SENTIMENTS.includes(item.sentiment) ? item.sentiment : "neutral",
    received_at: new Date(item.received_at).toISOString(),
    permalink: String(item.permalink || ""),
    request_id: "",
    triage: "new",
    agent_note: String(item.agent_note || ""),
  };
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

async function upsertRow(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-feedback-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-feedback-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const payloadFiles = rawArgs.filter((arg) => !arg.startsWith("--"));
  if (!payloadFiles.length) fail("usage: node scripts/ingest_feedback.mjs <payload.json> [...] [--apply]");

  const payloads = [];
  for (const file of payloadFiles) {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    validatePayload(payload, file);
    payloads.push(payload);
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Feedback Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [productRows, sourceRows, feedbackRows] = await Promise.all([
    readAll(client, declared("products")),
    readAll(client, declared("sources")),
    readAll(client, declared("feedback")),
  ]);
  const productsById = new Map(productRows.map((row) => [row.product_id, row]));
  const sourcesById = new Map(sourceRows.map((row) => [row.source_id, row]));
  const existingFeedbackIds = new Set(feedbackRows.map((row) => row.feedback_id));

  let productsUpserted = 0;
  let sourcesUpserted = 0;
  let added = 0;
  let skipped = 0;

  for (const payload of payloads) {
    for (const productInput of Array.isArray(payload.products) ? payload.products : []) {
      if (!productInput.product_id) fail("payload.products[].product_id is required");
      const existing = productsById.get(productInput.product_id);
      const fields = {
        product_id: productInput.product_id,
        display_name: String(productInput.display_name || existing?.display_name || productInput.product_id),
        tagline: String(productInput.tagline ?? existing?.tagline ?? ""),
      };
      await upsertRow(
        client,
        declared("products"),
        existing,
        fields,
        `Upsert product ${productInput.product_id}`,
        apply,
      );
      productsById.set(productInput.product_id, { ...existing, ...fields });
      productsUpserted += 1;
    }

    const sourceId = sanitizeId(payload.source.source_id);
    const existingSource = sourcesById.get(sourceId);
    const now = new Date().toISOString();
    let addedForSource = 0;
    for (const raw of payload.items) {
      const item = normalizeItem(payload, raw);
      if (existingFeedbackIds.has(item.feedback_id)) {
        skipped += 1;
        continue;
      }
      await upsertRow(client, declared("feedback"), null, item, `Ingest feedback ${item.feedback_id}`, apply);
      existingFeedbackIds.add(item.feedback_id);
      added += 1;
      addedForSource += 1;
    }

    const itemCount = (existingSource?.item_count ? Number(existingSource.item_count) : 0) + addedForSource;
    const sourceFields = {
      source_id: sourceId,
      channel: payload.source.channel,
      name: String(payload.source.name || existingSource?.name || sourceId),
      collection: String(payload.source.collection || existingSource?.collection || ""),
      secret_envs: existingSource?.secret_envs || "[]",
      last_ingest_at: now,
      item_count: itemCount,
      status: "ok",
    };
    await upsertRow(
      client,
      declared("sources"),
      existingSource,
      sourceFields,
      `Ingest status for source ${sourceId}`,
      apply,
    );
    sourcesById.set(sourceId, { ...existingSource, ...sourceFields });
    sourcesUpserted += 1;

    await upsertRow(
      client,
      declared("sync-log"),
      null,
      {
        sync_id: `ingest-${sourceId}-${Date.now()}`,
        at: now,
        actor: "kelly-feedback",
        action: "ingest",
        detail: `Ingested ${addedForSource} item(s) from ${sourceId}.`,
        count: addedForSource,
      },
      `Ingest log for ${sourceId}`,
      apply,
    );

    console.log(`${payload.source.source_id}: ${addedForSource} new item(s)${apply ? "" : " (dry run)"}`);
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${productsUpserted} product(s), ${sourcesUpserted} source(s), ${added} feedback item(s); ${skipped} duplicate(s) skipped.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
