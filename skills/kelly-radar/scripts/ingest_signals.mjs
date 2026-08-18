#!/usr/bin/env node
// Single write-path for agent-collected competitor-monitoring signal
// payloads, ported from the retired scripts/ingest_signals.ts. Validates,
// dedupes by content_hash (computed the same way — sha256 of
// target_id+source_id+headline+summary+diff text — ported verbatim from the
// retired lib/data-provider/local-file-provider.ts's contentHash()), and
// auto-creates/updates the watchlist target + source entry on the fly —
// same rules as the retired local-file version, just against Busabase
// records instead of app/.data/radar_snapshot.json.
//
// Usage: node scripts/ingest_signals.mjs <payload.json>
// Payload: { "collected_at": "ISO", "signals": [ { target_id, source_id, source_kind, headline, summary, ... } ] }
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { SEVERITIES, SOURCE_KINDS } from "../app/app/js/radar-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_signals.mjs <payload.json>

Validates and merges a competitor-monitoring signal payload into Busabase
(Signals, Watchlist), deduping by content_hash (target_id+source_id+headline+
summary+diff text) and auto-creating/updating the watchlist target + source
entry on the fly.`);
}

function fail(message) {
  console.error(`ingest_signals: ${message}`);
  process.exit(1);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's contentHash().
function contentHash(signal) {
  const diffText = (signal.diff?.lines || []).map((line) => `${line.type}:${line.text}`).join("\n");
  return crypto
    .createHash("sha256")
    .update([signal.target_id, signal.source_id, signal.headline, signal.summary, diffText].join("|"))
    .digest("hex");
}

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

async function create(client, declared, fields, message) {
  return client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-radar-ingest-signals",
    autoMerge: true,
  });
}

async function update(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-radar-ingest-signals",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const payloadPath = args[0];
  if (!payloadPath) return help();

  let payload;
  try {
    payload = JSON.parse(await readFile(payloadPath, "utf8"));
  } catch {
    fail(`cannot read payload JSON at ${payloadPath}`);
  }
  if (!payload || !Array.isArray(payload.signals)) fail(`${payloadPath} must contain a signals[] array`);

  payload.signals.forEach((signal, index) => {
    for (const key of ["target_id", "source_id", "source_kind", "headline", "summary", "detected_at"]) {
      if (typeof signal[key] !== "string" || !signal[key]) {
        fail(`signals[${index}].${key} must be a non-empty string`);
      }
    }
    if (!SOURCE_KINDS.includes(signal.source_kind)) {
      fail(`signals[${index}].source_kind must be one of ${SOURCE_KINDS.join("|")}`);
    }
    if (signal.severity && !SEVERITIES.includes(signal.severity)) {
      fail(`signals[${index}].severity must be one of ${SEVERITIES.join("|")}`);
    }
    if (signal.diff && !Array.isArray(signal.diff.lines)) fail(`signals[${index}].diff.lines must be an array`);
    if (signal.evidence && !Array.isArray(signal.evidence)) fail(`signals[${index}].evidence must be an array`);
  });

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Radar Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const now = new Date().toISOString();
  const [signalRows, watchlistRows] = await Promise.all([
    readAll(client, declared("signals")),
    readAll(client, declared("watchlist")),
  ]);
  const existingHashes = new Set(signalRows.map((row) => row.content_hash).filter(Boolean));
  const watchlistByTarget = new Map(watchlistRows.map((row) => [row.target_id, row]));

  let added = 0;
  let skipped = 0;
  for (const incoming of payload.signals) {
    const hash = incoming.content_hash || contentHash(incoming);
    if (existingHashes.has(hash)) {
      skipped += 1;
      continue;
    }
    existingHashes.add(hash);
    const signalId = incoming.signal_id || `sig-${hash.slice(0, 10)}`;
    await create(
      client,
      declared("signals"),
      {
        signal_id: signalId,
        target_id: incoming.target_id,
        source_id: incoming.source_id,
        source_kind: incoming.source_kind,
        severity: incoming.severity || "medium",
        detected_at: incoming.detected_at,
        status: "needs_review",
        headline: incoming.headline,
        summary: incoming.summary,
        why_it_matters: incoming.why_it_matters || "",
        content_hash: hash,
        evidence: JSON.stringify(incoming.evidence || []),
        proposed_action: incoming.proposed_action || "watch",
        handoff: incoming.handoff ? JSON.stringify(incoming.handoff) : "",
        diff: incoming.diff ? JSON.stringify(incoming.diff) : "",
        decision_verdict: "",
        decision_comment: "",
        decided_at: "",
      },
      `Signal for ${incoming.target_id}`,
    );
    added += 1;

    const target = watchlistByTarget.get(incoming.target_id);
    const sources = target ? parseJsonValue(target.sources, []) || [] : [];
    const sourceIndex = sources.findIndex((source) => source.source_id === incoming.source_id);
    const nextSource = {
      source_id: incoming.source_id,
      kind: incoming.source_kind,
      url: incoming.source_url || (sourceIndex >= 0 ? sources[sourceIndex].url : ""),
      method: incoming.source_method || (sourceIndex >= 0 ? sources[sourceIndex].method : "browser_agent"),
      last_check_at: incoming.collected_at || payload.collected_at || now,
      last_change_at: incoming.detected_at,
    };
    if (sourceIndex >= 0) sources[sourceIndex] = nextSource;
    else sources.push(nextSource);

    const targetFields = {
      target_id: incoming.target_id,
      name: target?.name || incoming.target_name || incoming.target_id,
      type: target?.type || incoming.target_type || "competitor",
      status: target?.status || "ok",
      notes: target?.notes || "Auto-created by ingest_signals; review in the watchlist.",
      last_check_at: payload.collected_at || now,
      sources: JSON.stringify(sources),
    };
    if (target) {
      await update(client, target, targetFields, `Refresh watchlist target ${incoming.target_id}`);
    } else {
      await create(client, declared("watchlist"), targetFields, `New watchlist target ${incoming.target_id}`);
    }
    watchlistByTarget.set(incoming.target_id, {
      ...targetFields,
      __recordId: target?.__recordId,
      __headCommitId: target?.__headCommitId,
    });
  }

  await create(
    client,
    declared("sync_log"),
    {
      log_id: `log-${Date.now().toString(36)}`,
      at: now,
      actor: "kelly-radar-agent",
      action: "ingest_signals",
      detail: `${added} new signals added, ${skipped} duplicates skipped.`,
    },
    "Ingest signals sync log",
  );

  console.log(`OK: ${added} added, ${skipped} duplicates skipped.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
