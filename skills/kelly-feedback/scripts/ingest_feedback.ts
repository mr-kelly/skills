#!/usr/bin/env node
// Single write path for raw feedback. Takes one or more payload JSON files
// (from sibling skills' agents, exports, or manual notes), validates them,
// dedupes by source id, and merges into app/.data/feedback_snapshot.json.
//
// Usage: node scripts/ingest_feedback.mjs payload.json [more.json ...]
// Payload shape: see references/feedback-schema.md (Ingest Payload).
import fs from "node:fs/promises";
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import { acquireLock, emptySnapshot, readJson, recomputeDerived, releaseLock, writeJson } from "../app/server/store.ts";

const CHANNELS = ["email", "discord", "slack", "x", "appstore", "survey", "interview"];
const SENTIMENTS = ["positive", "neutral", "negative"];

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/ingest_feedback.mjs <payload.json> [more.json ...]");
  process.exit(1);
}

function fail(message) {
  console.error(`Ingest failed: ${message}`);
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
    user: {
      handle: String(item.user?.handle || "unknown"),
      plan: String(item.user?.plan || ""),
      tenure_months: Number(item.user?.tenure_months || 0),
      weight: Number(item.user?.weight || 1),
    },
    text: String(item.text),
    sentiment: SENTIMENTS.includes(item.sentiment) ? item.sentiment : "neutral",
    received_at: new Date(item.received_at).toISOString(),
    permalink: String(item.permalink || ""),
    request_id: "",
    triage: "new",
    agent_note: String(item.agent_note || ""),
  };
}

const payloads = [];
for (const file of files) {
  const payload = await readJson(file, null);
  if (!payload) fail(`cannot read ${file}`);
  validatePayload(payload, file);
  payloads.push(payload);
}

await acquireLock("Ingesting feedback payloads").catch((error) => fail(error.message));
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  const existingIds = new Set(snapshot.feedback.map((item) => item.feedback_id));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  for (const payload of payloads) {
    const sourceId = sanitizeId(payload.source.source_id);
    let addedForSource = 0;
    for (const raw of payload.items) {
      const item = normalizeItem(payload, raw);
      if (existingIds.has(item.feedback_id)) {
        skipped += 1;
        continue;
      }
      existingIds.add(item.feedback_id);
      snapshot.feedback.push(item);
      added += 1;
      addedForSource += 1;
    }
    const existingSource = snapshot.sources.find((source) => source.source_id === sourceId);
    if (existingSource) {
      existingSource.last_ingest_at = now;
      existingSource.item_count = snapshot.feedback.filter((item) => item.source_id === sourceId).length;
      existingSource.status = "ok";
      if (payload.source.name) existingSource.name = payload.source.name;
      if (payload.source.collection) existingSource.collection = payload.source.collection;
    } else {
      snapshot.sources.push({
        source_id: sourceId,
        channel: payload.source.channel,
        name: String(payload.source.name || sourceId),
        collection: String(payload.source.collection || ""),
        last_ingest_at: now,
        item_count: addedForSource,
        status: "ok",
      });
    }
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-feedback";
  snapshot.sync_log.push({
    at: now,
    actor: "kelly-feedback",
    action: "ingest",
    detail: `Ingested ${added} item(s) from ${payloads.length} payload(s); ${skipped} duplicate(s) skipped.`,
    count: added,
  });
  recomputeDerived(snapshot);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Ingested ${added} item(s), skipped ${skipped} duplicate(s).`);
  console.log(`Wrote ${SNAPSHOT_PATH}`);
} finally {
  await releaseLock();
}
