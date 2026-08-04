#!/usr/bin/env node
// Single write path for agent-collected trend/candidate payloads, ported from
// the retired scripts/ingest_trends.ts. Validates, dedupes trend items by
// source + external_id (falling back to a content hash), dedupes candidates
// by candidate_id or name+source, merges, refreshes source sweep freshness,
// and appends a sync_log entry — same rules as the retired local-file
// version, just against Busabase records instead of app/.data/picks_snapshot.json.
//
// Usage: node scripts/ingest_trends.mjs <payload.json>
// Payload: { "trend_items": [...], "candidates": [...], "source_sweeps": [{ source_id, swept_at }] }
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { SOURCE_KINDS, STAGES } from "../app/app/js/picks-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/ingest_trends.mjs <payload.json>

Validates and merges a trend/candidate payload into Busabase (Trend Items,
Candidates, Sources), deduping trend items by source + external_id (falling
back to a content hash) and candidates by candidate_id or name+source.`);
}

function fail(message) {
  console.error(`ingest_trends: ${message}`);
  process.exit(1);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function contentHash(item) {
  return crypto
    .createHash("sha256")
    .update(`${item.source}::${item.title}::${item.url || ""}`)
    .digest("hex")
    .slice(0, 16);
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

async function create(client, declared, fields, message) {
  return client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-picks-ingest-trends",
    autoMerge: true,
  });
}

async function update(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-picks-ingest-trends",
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
  if (!payloadPath) return help();

  let payload;
  try {
    payload = JSON.parse(await readFile(payloadPath, "utf8"));
  } catch {
    fail(`cannot read payload JSON at ${payloadPath}`);
  }
  if (!payload || (!Array.isArray(payload.trend_items) && !Array.isArray(payload.candidates))) {
    fail(`${payloadPath} must contain a trend_items[] and/or candidates[] array`);
  }
  const incomingTrends = Array.isArray(payload.trend_items) ? payload.trend_items : [];
  const incomingCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  incomingTrends.forEach((item, index) => {
    if (typeof item.title !== "string" || !item.title) fail(`trend_items[${index}].title must be a non-empty string`);
    if (!SOURCE_KINDS.includes(item.source))
      fail(`trend_items[${index}].source must be one of ${SOURCE_KINDS.join("|")}`);
    if (item.momentum && !Array.isArray(item.momentum))
      fail(`trend_items[${index}].momentum must be an array of numbers`);
  });
  incomingCandidates.forEach((item, index) => {
    if (typeof item.name !== "string" || !item.name) fail(`candidates[${index}].name must be a non-empty string`);
    if (!SOURCE_KINDS.includes(item.source))
      fail(`candidates[${index}].source must be one of ${SOURCE_KINDS.join("|")}`);
    if (item.stage && !STAGES.includes(item.stage))
      fail(`candidates[${index}].stage must be one of ${STAGES.join("|")}`);
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
    throw new Error("Kelly Picks Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const now = new Date().toISOString();
  const [trendRows, candidateRows, sourceRows] = await Promise.all([
    readAll(client, declared("trend_items")),
    readAll(client, declared("candidates")),
    readAll(client, declared("sources")),
  ]);

  // --- Trend items: dedupe by source + external_id, falling back to content hash ---
  const trendKey = (item) =>
    item.external_id ? `${item.source}::${item.external_id}` : `hash::${item.content_hash || contentHash(item)}`;
  const trendByKey = new Map(
    trendRows.map((item) => [
      trendKey({ source: item.source, external_id: item.external_id, content_hash: item.content_hash }),
      item,
    ]),
  );
  let trendsAdded = 0;
  let trendsUpdated = 0;
  let trendsSkipped = 0;
  for (const incoming of incomingTrends) {
    const normalized = { ...incoming, content_hash: incoming.content_hash || contentHash(incoming) };
    const key = trendKey(normalized);
    const existing = trendByKey.get(key);
    if (existing) {
      const changed =
        Number(normalized.metric_value ?? existing.metric_value) !== Number(existing.metric_value) ||
        Number(normalized.delta_pct ?? existing.delta_pct) !== Number(existing.delta_pct);
      if (!changed) {
        trendsSkipped += 1;
        continue;
      }
      const momentum =
        Array.isArray(normalized.momentum) && normalized.momentum.length
          ? normalized.momentum
          : parseJsonValue(existing.momentum, []);
      await update(
        client,
        existing,
        {
          trend_id: existing.trend_id,
          source: existing.source,
          title: existing.title,
          summary: normalized.summary || existing.summary,
          url: existing.url,
          metric_label: normalized.metric_label || existing.metric_label,
          metric_value: Number(normalized.metric_value ?? existing.metric_value ?? 0),
          delta_pct: Number(normalized.delta_pct ?? existing.delta_pct ?? 0),
          momentum: JSON.stringify(momentum),
          observed_at: normalized.observed_at || now,
          candidate_id: existing.candidate_id || normalized.candidate_id || "",
          external_id: existing.external_id,
          content_hash: existing.content_hash,
          promotion_action: existing.promotion_action || "",
          promotion_comment: existing.promotion_comment || "",
          promotion_decided_at: existing.promotion_decided_at || "",
        },
        `Update trend item ${existing.trend_id}`,
      );
      trendsUpdated += 1;
    } else {
      const trend_id = normalized.trend_id || `tr-${slugify(normalized.title)}-${normalized.source}`;
      await create(
        client,
        declared("trend_items"),
        {
          trend_id,
          source: normalized.source,
          title: normalized.title,
          summary: normalized.summary || "",
          url: normalized.url || "",
          metric_label: normalized.metric_label || "",
          metric_value: Number(normalized.metric_value ?? 0),
          delta_pct: Number(normalized.delta_pct ?? 0),
          momentum: JSON.stringify(Array.isArray(normalized.momentum) ? normalized.momentum : []),
          observed_at: normalized.observed_at || now,
          candidate_id: normalized.candidate_id || "",
          external_id: normalized.external_id || "",
          content_hash: normalized.content_hash,
          promotion_action: "",
          promotion_comment: "",
          promotion_decided_at: "",
        },
        `New trend item ${trend_id}`,
      );
      trendByKey.set(key, { trend_id });
      trendsAdded += 1;
    }
  }

  // --- Candidates: dedupe by candidate_id, falling back to name + source ---
  const candidateByKey = new Map();
  for (const item of candidateRows) {
    candidateByKey.set(`id::${item.candidate_id}`, item);
    candidateByKey.set(`ns::${String(item.name || "").toLowerCase()}::${item.source}`, item);
  }
  let candidatesAdded = 0;
  let candidatesUpdated = 0;
  for (const incoming of incomingCandidates) {
    const key = incoming.candidate_id
      ? `id::${incoming.candidate_id}`
      : `ns::${incoming.name.toLowerCase()}::${incoming.source}`;
    const existing =
      candidateByKey.get(key) || candidateByKey.get(`ns::${incoming.name.toLowerCase()}::${incoming.source}`);
    if (existing) {
      const existingMarginCard = parseJsonValue(existing.margin_card, {});
      const existingCompetition = parseJsonValue(existing.competition, {});
      const mergedMarginCard =
        incoming.margin_card && typeof incoming.margin_card === "object"
          ? { ...existingMarginCard, ...incoming.margin_card }
          : existingMarginCard;
      const mergedCompetition =
        incoming.competition && typeof incoming.competition === "object"
          ? { ...existingCompetition, ...incoming.competition }
          : existingCompetition;
      const evidence =
        Array.isArray(incoming.evidence) && incoming.evidence.length
          ? incoming.evidence
          : parseJsonValue(existing.evidence, []);
      await update(
        client,
        existing,
        {
          candidate_id: existing.candidate_id,
          name: existing.name,
          category: existing.category,
          source: existing.source,
          source_ref: existing.source_ref,
          stage: existing.stage,
          platform_id: existing.platform_id,
          competition_grade: existing.competition_grade,
          momentum_pct: Number(incoming.momentum_pct ?? existing.momentum_pct ?? 0),
          est_price: Number(incoming.est_price ?? existing.est_price ?? 0),
          currency: existing.currency,
          margin_card: JSON.stringify(mergedMarginCard),
          competition: JSON.stringify(mergedCompetition),
          evidence: JSON.stringify(evidence),
          why_it_matters: incoming.why_it_matters || existing.why_it_matters,
          first_seen: existing.first_seen,
          last_updated: now,
          verdict_action: existing.verdict_action || "",
          verdict_comment: existing.verdict_comment || "",
          verdict_decided_at: existing.verdict_decided_at || "",
        },
        `Update candidate ${existing.candidate_id}`,
      );
      candidatesUpdated += 1;
    } else {
      const candidate_id = incoming.candidate_id || `cand-${slugify(incoming.name)}`;
      await create(
        client,
        declared("candidates"),
        {
          candidate_id,
          name: incoming.name,
          category: incoming.category || "",
          source: incoming.source,
          source_ref: incoming.source_ref || "",
          stage: incoming.stage || "new",
          platform_id: incoming.platform_id || "",
          competition_grade: incoming.competition_grade || "C",
          momentum_pct: Number(incoming.momentum_pct ?? 0),
          est_price: Number(incoming.est_price ?? 0),
          currency: incoming.currency || "USD",
          margin_card: JSON.stringify({
            price: Number(incoming.est_price ?? 0),
            cogs: 0,
            freight: 0,
            platform_fee_pct: 0,
            platform_fee: 0,
            ad_cost: 0,
            margin: 0,
            margin_pct: 0,
            breakeven_acos_pct: 0,
            below_floor: false,
            computed_at: "",
            ...(incoming.margin_card && typeof incoming.margin_card === "object" ? incoming.margin_card : {}),
          }),
          competition: JSON.stringify(
            incoming.competition && typeof incoming.competition === "object"
              ? incoming.competition
              : {
                  top_review_counts: [],
                  head_share_pct: 0,
                  dominance_note: "",
                  new_entrants_90d: 0,
                  velocity_note: "",
                },
          ),
          evidence: JSON.stringify(Array.isArray(incoming.evidence) ? incoming.evidence : []),
          why_it_matters: incoming.why_it_matters || "",
          first_seen: incoming.first_seen || now,
          last_updated: now,
          verdict_action: "",
          verdict_comment: "",
          verdict_decided_at: "",
        },
        `New candidate ${candidate_id}`,
      );
      candidateByKey.set(`id::${candidate_id}`, { candidate_id });
      candidateByKey.set(`ns::${incoming.name.toLowerCase()}::${incoming.source}`, { candidate_id });
      candidatesAdded += 1;
    }
  }

  // --- Source sweep freshness ---
  const sweeps = Array.isArray(payload.source_sweeps) ? payload.source_sweeps : [];
  for (const sweep of sweeps) {
    const existing = sourceRows.find((row) => row.source_id === sweep.source_id);
    if (existing) {
      await update(
        client,
        existing,
        {
          source_id: existing.source_id,
          kind: existing.kind,
          name: existing.name,
          method: existing.method,
          last_sweep_at: sweep.swept_at || now,
          items_7d: existing.items_7d,
          status: "ok",
        },
        `Sweep freshness for ${existing.source_id}`,
      );
    }
  }

  const detail = `${trendsAdded} trend items added, ${trendsUpdated} updated, ${trendsSkipped} duplicates skipped; ${candidatesAdded} candidates added, ${candidatesUpdated} updated.`;
  await create(
    client,
    declared("sync_log"),
    { log_id: `log-${Date.now().toString(36)}`, at: now, actor: "kelly-picks-agent", action: "ingest_trends", detail },
    "Ingest sync log",
  );

  console.log(`OK: ${detail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
