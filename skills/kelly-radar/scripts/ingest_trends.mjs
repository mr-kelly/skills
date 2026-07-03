#!/usr/bin/env node
// Write-path for trend mover payloads, with optional read-only import of a kelly-seo snapshot.
// Usage: node scripts/ingest_trends.mjs <payload.json> [kelly-seo-snapshot.json]
// Payload: { "movers": [ { keyword, source, volume_proxy, delta_pct, momentum[] } ], "opportunities": [ ... ] }
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { acquireLock, emptySnapshot, readJson, releaseLock, writeJson } from "../app/server/store.mjs";

const MOVER_SOURCES = ["search", "community", "category"];

function fail(message) {
  console.error(`ingest_trends failed: ${message}`);
  process.exit(1);
}

const payloadPath = process.argv[2];
const seoSnapshotPath = process.argv[3] || "";
if (!payloadPath) fail("usage: node scripts/ingest_trends.mjs <payload.json> [kelly-seo-snapshot.json]");

const payload = await readJson(payloadPath, null);
if (!payload || !Array.isArray(payload.movers)) fail(`${payloadPath} must contain a movers[] array`);

payload.movers.forEach((mover, index) => {
  if (typeof mover.keyword !== "string" || !mover.keyword) fail(`movers[${index}].keyword must be a non-empty string`);
  if (!MOVER_SOURCES.includes(mover.source)) fail(`movers[${index}].source must be one of ${MOVER_SOURCES.join("|")}`);
  if (mover.momentum && !Array.isArray(mover.momentum)) fail(`movers[${index}].momentum must be an array of numbers`);
});

// Optional, read-only cross-read of a kelly-seo snapshot: import rising queries as search movers.
let seoImported = [];
if (seoSnapshotPath) {
  const seo = await readJson(seoSnapshotPath, null);
  if (!seo) {
    console.warn(`Note: kelly-seo snapshot not readable at ${seoSnapshotPath}; skipping import.`);
  } else {
    const candidates = [seo.rising_queries, seo.queries, seo.search_queries, seo.keywords, seo.snapshot?.rising_queries]
      .find((value) => Array.isArray(value) && value.length) || [];
    seoImported = candidates
      .map((entry) => ({
        keyword: entry.keyword || entry.query || entry.term || "",
        source: "search",
        volume_proxy: Number(entry.volume_proxy ?? entry.impressions ?? entry.volume ?? entry.clicks ?? 0),
        delta_pct: Number(entry.delta_pct ?? entry.change_pct ?? entry.delta ?? 0),
        momentum: Array.isArray(entry.momentum) ? entry.momentum : []
      }))
      .filter((entry) => entry.keyword);
    if (!seoImported.length) console.warn(`Note: no rising queries found in ${seoSnapshotPath}; nothing imported.`);
  }
}

const now = new Date().toISOString();
const today = now.slice(0, 10);
await acquireLock("kelly-radar/ingest_trends", `Ingesting trend movers from ${payloadPath}`);
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  snapshot.trends = snapshot.trends || { movers: [], opportunities: [] };
  snapshot.trends.movers = snapshot.trends.movers || [];
  snapshot.trends.opportunities = snapshot.trends.opportunities || [];

  const keyFor = (mover) => `${mover.keyword.toLowerCase()}::${mover.source}`;
  const byKey = new Map(snapshot.trends.movers.map((mover) => [keyFor(mover), mover]));

  let added = 0;
  let updated = 0;
  for (const incoming of [...payload.movers, ...seoImported]) {
    const existing = byKey.get(keyFor(incoming));
    if (existing) {
      existing.volume_proxy = Number(incoming.volume_proxy ?? existing.volume_proxy ?? 0);
      existing.delta_pct = Number(incoming.delta_pct ?? existing.delta_pct ?? 0);
      if (Array.isArray(incoming.momentum) && incoming.momentum.length) existing.momentum = incoming.momentum;
      existing.last_updated = now;
      updated += 1;
    } else {
      const mover = {
        mover_id: incoming.mover_id || `mv-${incoming.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${incoming.source}`,
        keyword: incoming.keyword,
        source: incoming.source,
        volume_proxy: Number(incoming.volume_proxy ?? 0),
        delta_pct: Number(incoming.delta_pct ?? 0),
        momentum: Array.isArray(incoming.momentum) ? incoming.momentum : [],
        first_seen: incoming.first_seen || today,
        last_updated: now,
        opportunity_id: incoming.opportunity_id || ""
      };
      snapshot.trends.movers.push(mover);
      byKey.set(keyFor(mover), mover);
      added += 1;
    }
  }

  const opportunityIds = new Set(snapshot.trends.opportunities.map((item) => item.opportunity_id));
  let opportunitiesAdded = 0;
  for (const incoming of Array.isArray(payload.opportunities) ? payload.opportunities : []) {
    if (!incoming.opportunity_id || opportunityIds.has(incoming.opportunity_id)) continue;
    snapshot.trends.opportunities.push({
      status: "needs_review",
      created_at: now,
      mover_ids: [],
      ...incoming
    });
    opportunityIds.add(incoming.opportunity_id);
    opportunitiesAdded += 1;
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-radar";
  snapshot.metrics = {
    ...snapshot.metrics,
    trend_mover_count: snapshot.trends.movers.length,
    opportunities_open: snapshot.trends.opportunities.filter((item) => item.status === "needs_review").length
  };
  snapshot.sync_log = snapshot.sync_log || [];
  snapshot.sync_log.unshift({
    at: now,
    actor: "kelly-radar-agent",
    action: "ingest_trends",
    detail: `${added} movers added, ${updated} updated, ${opportunitiesAdded} opportunities added${seoImported.length ? `, ${seoImported.length} rising queries imported from kelly-seo` : ""}.`
  });
  snapshot.sync_log = snapshot.sync_log.slice(0, 50);

  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`OK: ${added} movers added, ${updated} updated, ${opportunitiesAdded} opportunities added → ${SNAPSHOT_PATH}`);
} finally {
  await releaseLock();
}
