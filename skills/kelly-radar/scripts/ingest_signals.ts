#!/usr/bin/env node
// Single write-path for agent-collected signal payloads.
// Usage: node scripts/ingest_signals.mjs <payload.json>
// Payload: { "collected_at": "ISO", "signals": [ { target_id, source_id, source_kind, headline, summary, ... } ] }
import crypto from "node:crypto";
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import { acquireLock, emptySnapshot, readJson, releaseLock, writeJson } from "../app/server/store.ts";

const SOURCE_KINDS = ["pricing", "changelog", "landing", "launch", "reviews", "news", "hiring", "community"];
const SEVERITIES = ["high", "medium", "low"];

function fail(message) {
  console.error(`ingest_signals failed: ${message}`);
  process.exit(1);
}

const payloadPath = process.argv[2];
if (!payloadPath) fail("usage: node scripts/ingest_signals.mjs <payload.json>");

const payload = await readJson(payloadPath, null);
if (!payload || !Array.isArray(payload.signals)) fail(`${payloadPath} must contain a signals[] array`);

payload.signals.forEach((signal, index) => {
  for (const key of ["target_id", "source_id", "source_kind", "headline", "summary", "detected_at"]) {
    if (typeof signal[key] !== "string" || !signal[key]) fail(`signals[${index}].${key} must be a non-empty string`);
  }
  if (!SOURCE_KINDS.includes(signal.source_kind))
    fail(`signals[${index}].source_kind must be one of ${SOURCE_KINDS.join("|")}`);
  if (signal.severity && !SEVERITIES.includes(signal.severity))
    fail(`signals[${index}].severity must be one of ${SEVERITIES.join("|")}`);
  if (signal.diff && !Array.isArray(signal.diff.lines)) fail(`signals[${index}].diff.lines must be an array`);
  if (signal.evidence && !Array.isArray(signal.evidence)) fail(`signals[${index}].evidence must be an array`);
});

function contentHash(signal) {
  const diffText = (signal.diff?.lines || []).map((line) => `${line.type}:${line.text}`).join("\n");
  return crypto
    .createHash("sha256")
    .update([signal.target_id, signal.source_id, signal.headline, signal.summary, diffText].join("|"))
    .digest("hex");
}

const now = new Date().toISOString();
await acquireLock("kelly-radar/ingest_signals", `Ingesting ${payload.signals.length} signals from ${payloadPath}`);
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  snapshot.signals = snapshot.signals || [];
  snapshot.watchlist = snapshot.watchlist || [];
  const existingHashes = new Set(snapshot.signals.map((signal) => signal.content_hash).filter(Boolean));

  let added = 0;
  let skipped = 0;
  for (const incoming of payload.signals) {
    const hash = incoming.content_hash || contentHash(incoming);
    if (existingHashes.has(hash)) {
      skipped += 1;
      continue;
    }
    existingHashes.add(hash);
    snapshot.signals.push({
      signal_id: incoming.signal_id || `sig-${hash.slice(0, 10)}`,
      target_id: incoming.target_id,
      source_id: incoming.source_id,
      source_kind: incoming.source_kind,
      headline: incoming.headline,
      summary: incoming.summary,
      why_it_matters: incoming.why_it_matters || "",
      severity: incoming.severity || "medium",
      detected_at: incoming.detected_at,
      status: "needs_review",
      proposed_action: incoming.proposed_action || "watch",
      ...(incoming.handoff ? { handoff: incoming.handoff } : {}),
      ...(incoming.diff ? { diff: incoming.diff } : {}),
      evidence: incoming.evidence || [],
      content_hash: hash,
    });
    added += 1;

    let target = snapshot.watchlist.find((entry) => entry.target_id === incoming.target_id);
    if (!target) {
      target = {
        target_id: incoming.target_id,
        name: incoming.target_name || incoming.target_id,
        type: incoming.target_type || "competitor",
        status: "ok",
        notes: "Auto-created by ingest_signals; review in config.",
        last_check_at: now,
        signals_7d: 0,
        sources: [],
      };
      snapshot.watchlist.push(target);
    }
    target.last_check_at = payload.collected_at || now;
    if (!target.sources.some((source) => source.source_id === incoming.source_id)) {
      target.sources.push({
        source_id: incoming.source_id,
        kind: incoming.source_kind,
        url: incoming.source_url || "",
        method: incoming.source_method || "browser_agent",
        last_check_at: payload.collected_at || now,
        last_change_at: incoming.detected_at,
      });
    } else {
      const source = target.sources.find((entry) => entry.source_id === incoming.source_id);
      source.last_check_at = payload.collected_at || now;
      source.last_change_at = incoming.detected_at;
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  for (const target of snapshot.watchlist) {
    target.signals_7d = snapshot.signals.filter(
      (signal) => signal.target_id === target.target_id && new Date(signal.detected_at).getTime() >= weekAgo,
    ).length;
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-radar";
  snapshot.metrics = {
    ...snapshot.metrics,
    watch_target_count: snapshot.watchlist.length,
    signal_count: snapshot.signals.length,
    signals_needs_review: snapshot.signals.filter((signal) => signal.status === "needs_review").length,
  };
  snapshot.sync_log = snapshot.sync_log || [];
  snapshot.sync_log.unshift({
    at: now,
    actor: "kelly-radar-agent",
    action: "ingest_signals",
    detail: `${added} new signals added, ${skipped} duplicates skipped (${payloadPath}).`,
  });
  snapshot.sync_log = snapshot.sync_log.slice(0, 50);

  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`OK: ${added} added, ${skipped} duplicates skipped → ${SNAPSHOT_PATH}`);
} finally {
  await releaseLock();
}
