#!/usr/bin/env node
// Deterministic margin recompute across all candidates from the config fee tables.
// Usage: node scripts/compute_margins.mjs
// - Platform fee comes from config platforms[] (referral_fee_pct + fulfillment_flat).
// - Freight uses an agent-quoted margin_card.freight when present (freight_quoted: true),
//   otherwise the config freight rule for the candidate's category, otherwise the default.
// - Ad cost keeps an agent-provided margin_card.ad_cost when present, otherwise
//   price * ad_cost_default_pct.
// - Flags candidates whose margin_pct falls below seller_profile.margin_floor_pct.
// Idempotent: re-running with the same config and snapshot changes nothing.
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  acquireLock,
  computeMetrics,
  emptySnapshot,
  readConfig,
  readJson,
  releaseLock,
  writeJson,
} from "../app/server/store.mjs";

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

const { config, path: configPath } = await readConfig();
const platforms = new Map(
  (Array.isArray(config.platforms) ? config.platforms : []).map((platform) => [platform.platform_id, platform]),
);
const freightRules = new Map(
  (config.freight && Array.isArray(config.freight.rules) ? config.freight.rules : []).map((rule) => [
    rule.category,
    Number(rule.per_unit) || 0,
  ]),
);
const freightDefault = Number(config.freight?.default_per_unit) || 0;
const adDefaultPct = Number(config.ad_cost_default_pct) || 0;
const marginFloor = Number(config.seller_profile?.margin_floor_pct) || 0;

const now = new Date().toISOString();
await acquireLock("kelly-picks/compute_margins", "Recomputing margin cards from fee tables");
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  let changed = 0;
  let flagged = 0;

  for (const candidate of snapshot.candidates || []) {
    const card = candidate.margin_card || {};
    const price = Number(card.price ?? candidate.est_price ?? 0);
    const cogs = Number(card.cogs ?? 0);
    const platform = platforms.get(candidate.platform_id);
    const referralPct = Number(platform?.referral_fee_pct ?? card.platform_fee_pct ?? 0);
    const fulfillmentFlat = Number(platform?.fulfillment_flat ?? 0);
    const freight =
      card.freight_quoted && Number.isFinite(Number(card.freight))
        ? Number(card.freight)
        : freightRules.has(candidate.category)
          ? freightRules.get(candidate.category)
          : Number(card.freight) || freightDefault;
    const adCost =
      Number.isFinite(Number(card.ad_cost)) && Number(card.ad_cost) > 0
        ? Number(card.ad_cost)
        : round2(price * (adDefaultPct / 100));

    const feeAmount = round2(price * (referralPct / 100) + fulfillmentFlat);
    const effectiveFeePct = price > 0 ? round1((feeAmount / price) * 100) : 0;
    const marginBeforeAds = round2(price - cogs - freight - feeAmount);
    const margin = round2(marginBeforeAds - adCost);
    const marginPct = price > 0 ? round1((margin / price) * 100) : 0;
    const acosPct = price > 0 ? round1((marginBeforeAds / price) * 100) : 0;
    const belowFloor = marginPct < marginFloor;

    const next = {
      ...card,
      price,
      cogs,
      freight: round2(freight),
      platform_fee_pct: effectiveFeePct,
      platform_fee: feeAmount,
      ad_cost: round2(adCost),
      margin,
      margin_pct: marginPct,
      breakeven_acos_pct: acosPct,
      below_floor: belowFloor,
    };
    const before = JSON.stringify({ ...card, computed_at: "" });
    const after = JSON.stringify({ ...next, computed_at: "" });
    if (before !== after) {
      next.computed_at = now;
      candidate.margin_card = next;
      candidate.last_updated = now;
      changed += 1;
    }
    if (belowFloor) flagged += 1;
  }

  if (changed > 0) {
    snapshot.generated_at = now;
    snapshot.metrics = { ...snapshot.metrics, ...computeMetrics(snapshot) };
    snapshot.sync_log = snapshot.sync_log || [];
    snapshot.sync_log.unshift({
      at: now,
      actor: "kelly-picks-agent",
      action: "compute_margins",
      detail: `${changed} margin cards recomputed from ${configPath || "defaults"}; ${flagged} candidates below the ${marginFloor}% margin floor.`,
    });
    snapshot.sync_log = snapshot.sync_log.slice(0, 50);
    await writeJson(SNAPSHOT_PATH, snapshot);
  }
  console.log(`OK: ${changed} margin cards changed, ${flagged} below the ${marginFloor}% floor → ${SNAPSHOT_PATH}`);
  if (changed === 0) console.log("No changes — snapshot already consistent with the fee tables (idempotent).");
} finally {
  await releaseLock();
}
