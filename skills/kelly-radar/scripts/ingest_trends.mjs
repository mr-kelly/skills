#!/usr/bin/env node
// Write-path for trend mover payloads, with an optional read-only import of
// a kelly-seo snapshot, ported from the retired scripts/ingest_trends.ts.
// Dedupes movers by keyword+source (case-insensitive keyword), updates
// volume/delta/momentum for existing movers, and can add opportunity cards
// — same rules as the retired local-file version, just against Busabase
// records instead of app/.data/radar_snapshot.json.
//
// Usage: node scripts/ingest_trends.mjs <payload.json> [kelly-seo-snapshot.json]
// Payload: { "movers": [ { keyword, source, volume_proxy, delta_pct, momentum[] } ], "opportunities": [ ... ] }
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { MOVER_SOURCES } from "../app/app/js/radar-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_trends.mjs <payload.json> [kelly-seo-snapshot.json]

Validates and merges a trend-mover payload into Busabase (Movers,
Opportunities), deduping movers by keyword+source and optionally
cross-reading a kelly-seo snapshot (read-only) to import rising queries as
search movers.`);
}

function fail(message) {
  console.error(`ingest_trends: ${message}`);
  process.exit(1);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readJsonFile(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
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
    submittedBy: "kelly-radar-ingest-trends",
    autoMerge: true,
  });
}

async function update(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-radar-ingest-trends",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const payloadPath = args[0];
  const seoSnapshotPath = args[1] || "";
  if (!payloadPath) return help();

  const payload = await readJsonFile(payloadPath);
  if (!payload || !Array.isArray(payload.movers)) fail(`${payloadPath} must contain a movers[] array`);

  payload.movers.forEach((mover, index) => {
    if (typeof mover.keyword !== "string" || !mover.keyword)
      fail(`movers[${index}].keyword must be a non-empty string`);
    if (!MOVER_SOURCES.includes(mover.source))
      fail(`movers[${index}].source must be one of ${MOVER_SOURCES.join("|")}`);
    if (mover.momentum && !Array.isArray(mover.momentum)) fail(`movers[${index}].momentum must be an array of numbers`);
  });

  // Optional, read-only cross-read of a kelly-seo snapshot: import rising queries as search movers.
  let seoImported = [];
  if (seoSnapshotPath) {
    const seo = await readJsonFile(seoSnapshotPath);
    if (!seo) {
      console.warn(`Note: kelly-seo snapshot not readable at ${seoSnapshotPath}; skipping import.`);
    } else {
      const candidates =
        [seo.rising_queries, seo.queries, seo.search_queries, seo.keywords, seo.snapshot?.rising_queries].find(
          (value) => Array.isArray(value) && value.length,
        ) || [];
      seoImported = candidates
        .map((entry) => ({
          keyword: entry.keyword || entry.query || entry.term || "",
          source: "search",
          volume_proxy: Number(entry.volume_proxy ?? entry.impressions ?? entry.volume ?? entry.clicks ?? 0),
          delta_pct: Number(entry.delta_pct ?? entry.change_pct ?? entry.delta ?? 0),
          momentum: Array.isArray(entry.momentum) ? entry.momentum : [],
        }))
        .filter((entry) => entry.keyword);
      if (!seoImported.length) console.warn(`Note: no rising queries found in ${seoSnapshotPath}; nothing imported.`);
    }
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
    throw new Error("Kelly Radar Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const [moverRows, opportunityRows] = await Promise.all([
    readAll(client, declared("movers")),
    readAll(client, declared("opportunities")),
  ]);
  const keyFor = (mover) => `${String(mover.keyword).toLowerCase()}::${mover.source}`;
  const byKey = new Map(moverRows.map((row) => [keyFor(row), row]));

  let added = 0;
  let updated = 0;
  for (const incoming of [...payload.movers, ...seoImported]) {
    const key = keyFor(incoming);
    const existing = byKey.get(key);
    if (existing) {
      const momentum =
        Array.isArray(incoming.momentum) && incoming.momentum.length
          ? incoming.momentum
          : parseJsonValue(existing.momentum, []);
      await update(
        client,
        existing,
        {
          mover_id: existing.mover_id,
          keyword: existing.keyword,
          source: existing.source,
          volume_proxy: Number(incoming.volume_proxy ?? existing.volume_proxy ?? 0),
          delta_pct: Number(incoming.delta_pct ?? existing.delta_pct ?? 0),
          momentum: JSON.stringify(momentum),
          first_seen: existing.first_seen || today,
          last_updated: now,
          opportunity_id: existing.opportunity_id || incoming.opportunity_id || "",
        },
        `Update trend mover ${existing.mover_id}`,
      );
      updated += 1;
    } else {
      const mover_id =
        incoming.mover_id ||
        `mv-${String(incoming.keyword)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${incoming.source}`;
      await create(
        client,
        declared("movers"),
        {
          mover_id,
          keyword: incoming.keyword,
          source: incoming.source,
          volume_proxy: Number(incoming.volume_proxy ?? 0),
          delta_pct: Number(incoming.delta_pct ?? 0),
          momentum: JSON.stringify(Array.isArray(incoming.momentum) ? incoming.momentum : []),
          first_seen: incoming.first_seen || today,
          last_updated: now,
          opportunity_id: incoming.opportunity_id || "",
        },
        `New trend mover ${mover_id}`,
      );
      byKey.set(key, { mover_id });
      added += 1;
    }
  }

  const opportunityIds = new Set(opportunityRows.map((row) => row.opportunity_id));
  let opportunitiesAdded = 0;
  for (const incoming of Array.isArray(payload.opportunities) ? payload.opportunities : []) {
    if (!incoming.opportunity_id || opportunityIds.has(incoming.opportunity_id)) continue;
    await create(
      client,
      declared("opportunities"),
      {
        opportunity_id: incoming.opportunity_id,
        title: incoming.title || "",
        mover_ids: JSON.stringify(Array.isArray(incoming.mover_ids) ? incoming.mover_ids : []),
        status: "needs_review",
        created_at: now,
        rationale: incoming.rationale || "",
        proposed_next_step: JSON.stringify(incoming.proposed_next_step || {}),
        decision_verdict: "",
        decision_comment: "",
        decided_at: "",
      },
      `New opportunity ${incoming.opportunity_id}`,
    );
    opportunityIds.add(incoming.opportunity_id);
    opportunitiesAdded += 1;
  }

  const detail = `${added} movers added, ${updated} updated, ${opportunitiesAdded} opportunities added${seoImported.length ? `, ${seoImported.length} rising queries imported from kelly-seo` : ""}.`;
  await create(
    client,
    declared("sync_log"),
    { log_id: `log-${Date.now().toString(36)}`, at: now, actor: "kelly-radar-agent", action: "ingest_trends", detail },
    "Ingest trends sync log",
  );

  console.log(`OK: ${detail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
