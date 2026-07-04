#!/usr/bin/env node
// Single write path for agent-collected trend/candidate payloads.
// Usage: node scripts/ingest_trends.mjs <payload.json>
// Payload: { "trend_items": [ ... ], "candidates": [ ... ], "source_sweeps": [ { source_id, swept_at } ] }
// Validates, dedupes trend items by source + external_id (falling back to a content hash),
// dedupes candidates by candidate_id or name+source, merges, refreshes metrics + sync_log,
// and honors app/.data/agent.lock.
import crypto from "node:crypto";
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { acquireLock, computeMetrics, emptySnapshot, readJson, releaseLock, writeJson } from "../app/server/store.mjs";

const SOURCE_KINDS = ["amazon_bsr", "tiktok", "temu", "aliexpress", "trends", "competitor"];
const STAGES = ["new", "reviewing", "develop", "watch", "dropped"];

function fail(message) {
  console.error(`ingest_trends failed: ${message}`);
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

const payloadPath = process.argv[2];
if (!payloadPath) fail("usage: node scripts/ingest_trends.mjs <payload.json>");

const payload = await readJson(payloadPath, null);
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
  if (!SOURCE_KINDS.includes(item.source)) fail(`candidates[${index}].source must be one of ${SOURCE_KINDS.join("|")}`);
  if (item.stage && !STAGES.includes(item.stage)) fail(`candidates[${index}].stage must be one of ${STAGES.join("|")}`);
});

const now = new Date().toISOString();
await acquireLock("kelly-picks/ingest_trends", `Ingesting trend payload from ${payloadPath}`);
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  snapshot.trend_items = snapshot.trend_items || [];
  snapshot.candidates = snapshot.candidates || [];
  snapshot.sources = snapshot.sources || [];

  // --- Trend items: dedupe by source + external_id, falling back to content hash ---
  const trendKey = (item) =>
    item.external_id ? `${item.source}::${item.external_id}` : `hash::${item.content_hash || contentHash(item)}`;
  const trendByKey = new Map(snapshot.trend_items.map((item) => [trendKey(item), item]));
  let trendsAdded = 0;
  let trendsUpdated = 0;
  let trendsSkipped = 0;
  for (const incoming of incomingTrends) {
    const normalized = {
      ...incoming,
      content_hash: incoming.content_hash || contentHash(incoming),
    };
    const existing = trendByKey.get(trendKey(normalized));
    if (existing) {
      const changed =
        Number(normalized.metric_value ?? existing.metric_value) !== Number(existing.metric_value) ||
        Number(normalized.delta_pct ?? existing.delta_pct) !== Number(existing.delta_pct);
      if (!changed) {
        trendsSkipped += 1;
        continue;
      }
      existing.metric_value = Number(normalized.metric_value ?? existing.metric_value ?? 0);
      existing.delta_pct = Number(normalized.delta_pct ?? existing.delta_pct ?? 0);
      if (Array.isArray(normalized.momentum) && normalized.momentum.length) existing.momentum = normalized.momentum;
      existing.summary = normalized.summary || existing.summary;
      existing.observed_at = normalized.observed_at || now;
      trendsUpdated += 1;
    } else {
      const item = {
        trend_id: normalized.trend_id || `tr-${slugify(normalized.title)}-${normalized.source}`,
        source: normalized.source,
        title: normalized.title,
        summary: normalized.summary || "",
        url: normalized.url || "",
        metric_label: normalized.metric_label || "",
        metric_value: Number(normalized.metric_value ?? 0),
        delta_pct: Number(normalized.delta_pct ?? 0),
        momentum: Array.isArray(normalized.momentum) ? normalized.momentum : [],
        observed_at: normalized.observed_at || now,
        candidate_id: normalized.candidate_id || "",
        external_id: normalized.external_id || "",
        content_hash: normalized.content_hash,
      };
      snapshot.trend_items.push(item);
      trendByKey.set(trendKey(item), item);
      trendsAdded += 1;
    }
  }

  // --- Candidates: dedupe by candidate_id, falling back to name + source ---
  const candidateKey = (item) =>
    item.candidate_id ? `id::${item.candidate_id}` : `ns::${item.name.toLowerCase()}::${item.source}`;
  const candidateByKey = new Map();
  for (const item of snapshot.candidates) {
    candidateByKey.set(`id::${item.candidate_id}`, item);
    candidateByKey.set(`ns::${String(item.name).toLowerCase()}::${item.source}`, item);
  }
  let candidatesAdded = 0;
  let candidatesUpdated = 0;
  for (const incoming of incomingCandidates) {
    const existing =
      candidateByKey.get(candidateKey(incoming)) ||
      candidateByKey.get(`ns::${incoming.name.toLowerCase()}::${incoming.source}`);
    if (existing) {
      existing.momentum_pct = Number(incoming.momentum_pct ?? existing.momentum_pct ?? 0);
      existing.est_price = Number(incoming.est_price ?? existing.est_price ?? 0);
      if (incoming.margin_card && typeof incoming.margin_card === "object") {
        existing.margin_card = { ...existing.margin_card, ...incoming.margin_card };
      }
      if (incoming.competition && typeof incoming.competition === "object") {
        existing.competition = { ...existing.competition, ...incoming.competition };
      }
      if (Array.isArray(incoming.evidence) && incoming.evidence.length) existing.evidence = incoming.evidence;
      existing.why_it_matters = incoming.why_it_matters || existing.why_it_matters;
      existing.last_updated = now;
      candidatesUpdated += 1;
    } else {
      const item = {
        candidate_id: incoming.candidate_id || `cand-${slugify(incoming.name)}`,
        name: incoming.name,
        category: incoming.category || "",
        source: incoming.source,
        source_ref: incoming.source_ref || "",
        stage: incoming.stage || "new",
        platform_id: incoming.platform_id || "",
        competition_grade: incoming.competition_grade || "C",
        momentum_pct: Number(incoming.momentum_pct ?? 0),
        est_price: Number(incoming.est_price ?? 0),
        currency: incoming.currency || snapshot.base_currency || "USD",
        margin_card: {
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
        },
        competition:
          incoming.competition && typeof incoming.competition === "object"
            ? incoming.competition
            : {
                top_review_counts: [],
                head_share_pct: 0,
                dominance_note: "",
                new_entrants_90d: 0,
                velocity_note: "",
              },
        evidence: Array.isArray(incoming.evidence) ? incoming.evidence : [],
        why_it_matters: incoming.why_it_matters || "",
        first_seen: incoming.first_seen || now,
        last_updated: now,
      };
      snapshot.candidates.push(item);
      candidateByKey.set(`id::${item.candidate_id}`, item);
      candidateByKey.set(`ns::${item.name.toLowerCase()}::${item.source}`, item);
      candidatesAdded += 1;
    }
  }

  // --- Source sweep freshness ---
  const sweeps = Array.isArray(payload.source_sweeps) ? payload.source_sweeps : [];
  for (const sweep of sweeps) {
    const source = snapshot.sources.find((entry) => entry.source_id === sweep.source_id);
    if (source) {
      source.last_sweep_at = sweep.swept_at || now;
      source.status = "ok";
    }
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-picks";
  snapshot.metrics = { ...snapshot.metrics, ...computeMetrics(snapshot) };
  snapshot.sync_log = snapshot.sync_log || [];
  snapshot.sync_log.unshift({
    at: now,
    actor: "kelly-picks-agent",
    action: "ingest_trends",
    detail: `${trendsAdded} trend items added, ${trendsUpdated} updated, ${trendsSkipped} duplicates skipped; ${candidatesAdded} candidates added, ${candidatesUpdated} updated.`,
  });
  snapshot.sync_log = snapshot.sync_log.slice(0, 50);

  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(
    `OK: ${trendsAdded} trend items added, ${trendsUpdated} updated, ${trendsSkipped} skipped; ${candidatesAdded} candidates added, ${candidatesUpdated} updated → ${SNAPSHOT_PATH}`,
  );
} finally {
  await releaseLock();
}
