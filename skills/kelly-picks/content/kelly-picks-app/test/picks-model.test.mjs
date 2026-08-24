import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  computeMarginCard,
  computeMetrics,
  freightRulesMap,
  normalizeCandidate,
  normalizeProposal,
  normalizeSource,
  normalizeSyncLogEntry,
  normalizeTrendItem,
  platformsMap,
  round1,
  round2,
  stageForCandidateAction,
  statusForProposalAction,
} from "../app/js/picks-model.js";

test("stageForCandidateAction maps every verdict, ported from lib/picks-core.ts", () => {
  assert.equal(stageForCandidateAction("develop"), "develop");
  assert.equal(stageForCandidateAction("watch"), "watch");
  assert.equal(stageForCandidateAction("drop"), "dropped");
  assert.equal(stageForCandidateAction("unknown"), "reviewing");
});

test("statusForProposalAction maps every review verb, ported from lib/picks-core.ts", () => {
  assert.equal(statusForProposalAction("approve"), "approved");
  assert.equal(statusForProposalAction("request_changes"), "changes_requested");
  assert.equal(statusForProposalAction("block"), "blocked");
  assert.equal(statusForProposalAction("revise"), "needs_review");
});

test("round2/round1 match the retired scripts/compute_margins.ts rounding helpers", () => {
  assert.equal(round2(3.2985), 3.3);
  assert.equal(round1(38.154), 38.2);
  assert.equal(round2(), 0);
});

test("computeMarginCard reproduces the demo lunchbox worked example (38.2% margin, 54.5% breakeven ACOS)", () => {
  // Same inputs as app/app/js/providers/demo-provider.js's cand-lunchbox row:
  // price 21.99, cogs 4.60, freight 2.10 (agent-quoted), 15% platform fee,
  // ad cost 3.60. The SKILL.md/demo copy calls out "38% margin" and
  // "breakeven ACOS near 55%" — this reproduces the exact rounded figures.
  const card = computeMarginCard({
    card: { price: 21.99, cogs: 4.6, freight: 2.1, freight_quoted: true, ad_cost: 3.6 },
    category: "kitchen",
    platform: { referral_fee_pct: 15, fulfillment_flat: 0 },
    freightRules: new Map(),
    freightDefault: 1.8,
    adDefaultPct: 15,
    marginFloor: 25,
  });
  assert.equal(card.platform_fee, 3.3);
  assert.equal(card.margin, 8.39);
  assert.equal(card.margin_pct, 38.2);
  assert.equal(card.breakeven_acos_pct, 54.5);
  assert.equal(card.below_floor, false);
});

test("computeMarginCard flags below_floor and defaults ad cost from the config percentage when unset", () => {
  // Mirrors cand-egg-cooker: 18.1% margin is below a 25% floor, and no
  // agent-provided ad_cost falls back to price * ad_cost_default_pct / 100.
  const card = computeMarginCard({
    card: { price: 15.99, cogs: 5.9, freight: 2.4 },
    category: "kitchen",
    platform: { referral_fee_pct: 15, fulfillment_flat: 0 },
    freightRules: new Map([["kitchen", 2.1]]),
    freightDefault: 1.8,
    adDefaultPct: 15,
    marginFloor: 25,
  });
  // freight is NOT quoted, so the category rule (2.1) wins over the raw
  // card.freight (2.4) and the global default (1.8).
  assert.equal(card.freight, 2.1);
  assert.equal(card.ad_cost, round2(15.99 * 0.15));
  assert.equal(card.below_floor, true);
});

test("computeMarginCard falls back to est_price when the margin card has no price of its own", () => {
  const card = computeMarginCard({ card: {}, estPrice: 10, platform: { referral_fee_pct: 10 }, marginFloor: 20 });
  assert.equal(card.price, 10);
  assert.equal(card.platform_fee, 1);
});

test("normalizeCandidate parses margin_card/competition/evidence JSON and null-verdict when unset", () => {
  const candidate = normalizeCandidate({
    candidate_id: "cand-1",
    name: "Widget",
    margin_card: JSON.stringify({ price: 10, margin_pct: 30 }),
    competition: JSON.stringify({ head_share_pct: 20 }),
    evidence: JSON.stringify([{ title: "a", url: "https://a" }]),
  });
  assert.equal(candidate.margin_card.margin_pct, 30);
  assert.equal(candidate.competition.head_share_pct, 20);
  assert.equal(candidate.evidence.length, 1);
  assert.equal(candidate.verdict, null);
});

test("normalizeCandidate reconstructs verdict only when verdict_action is present", () => {
  const candidate = normalizeCandidate({
    candidate_id: "cand-1",
    verdict_action: "develop",
    verdict_comment: "go",
    verdict_decided_at: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(candidate.verdict, { action: "develop", comment: "go", decided_at: "2026-01-01T00:00:00.000Z" });
});

test("normalizeProposal/normalizeTrendItem/normalizeSource/normalizeSyncLogEntry apply defaults", () => {
  assert.equal(normalizeProposal({}).status, "needs_review");
  assert.equal(normalizeTrendItem({}).momentum.length, 0);
  assert.equal(normalizeSource({ source_id: "s1" }).name, "s1");
  assert.equal(normalizeSyncLogEntry({}).actor, "kelly-picks-agent");
});

test("computeMetrics matches the retired lib/picks-core.ts formula", () => {
  const now = Date.now();
  const snapshot = {
    sources: [{}],
    trend_items: [{}, {}],
    candidates: [
      { stage: "develop", first_seen: new Date(now).toISOString(), margin_card: { margin_pct: 40 } },
      { stage: "new", first_seen: new Date(now - 30 * 24 * 3600 * 1000).toISOString() },
      { stage: "dropped", margin_card: { below_floor: true } },
    ],
    proposals: [{ status: "needs_review" }, { status: "approved" }],
  };
  const metrics = computeMetrics(snapshot);
  assert.equal(metrics.candidate_count, 3);
  assert.equal(metrics.candidates_new_7d, 1);
  assert.equal(metrics.candidates_to_review, 1);
  assert.equal(metrics.in_development, 1);
  assert.equal(metrics.dropped, 1);
  assert.equal(metrics.avg_margin_approved_pct, 40);
  assert.equal(metrics.below_margin_floor, 1);
  assert.equal(metrics.proposals_needs_review, 1);
});

test("buildSnapshot normalizes raw Busabase rows and computes fresh metrics", () => {
  const snapshot = buildSnapshot({
    candidates: [{ candidate_id: "c1", stage: "develop", margin_card: JSON.stringify({ margin_pct: 25 }) }],
    trend_items: [{ trend_id: "t1", source: "tiktok" }],
    proposals: [{ proposal_id: "p1", status: "needs_review" }],
    sources: [{ source_id: "s1" }],
    sync_log: [
      { log_id: "l1", at: "2026-01-01T00:00:00.000Z", action: "a" },
      { log_id: "l2", at: "2026-01-02T00:00:00.000Z", action: "b" },
    ],
    now: Date.parse("2026-01-05T00:00:00.000Z"),
  });
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.metrics.in_development, 1);
  // Newest sync_log entry first.
  assert.equal(snapshot.sync_log[0].log_id, "l2");
  assert.equal(snapshot.base_currency, "USD");
});

test("buildConfigSummary parses seller_profile/platforms/freight JSON from the settings row", () => {
  const summary = buildConfigSummary({
    settings: {
      seller_profile: JSON.stringify({ store_name: "Nimbus", margin_floor_pct: 25 }),
      platforms: JSON.stringify([{ platform_id: "amazon_us", referral_fee_pct: 15 }]),
      freight: JSON.stringify({ default_per_unit: 1.8, rules: [{ category: "home", per_unit: 2.4 }] }),
      ad_cost_default_pct: 15,
    },
    sources: [{ source_id: "s1", kind: "tiktok", method: "browser_agent" }],
  });
  assert.equal(summary.seller_profile.store_name, "Nimbus");
  assert.equal(summary.platforms[0].platform_id, "amazon_us");
  assert.equal(summary.freight.rules[0].category, "home");
  assert.equal(summary.ad_cost_default_pct, 15);
  assert.equal(summary.sources.length, 1);
});

test("platformsMap/freightRulesMap resolve config arrays into the Maps computeMarginCard expects", () => {
  const platforms = platformsMap([{ platform_id: "amazon_us", referral_fee_pct: 15 }]);
  assert.equal(platforms.get("amazon_us").referral_fee_pct, 15);
  const freight = freightRulesMap({ rules: [{ category: "home", per_unit: 2.4 }] });
  assert.equal(freight.get("home"), 2.4);
});
