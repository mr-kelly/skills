import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  configFromSettings,
  detectAnomalies,
  normalizeAdjustment,
  normalizeAnomaly,
  normalizeCampaign,
  operationFor,
  recomputeDerived,
  round1,
  round2,
  skeletonAdjustment,
  statusForVerdict,
  totalsForDays,
  trendFor,
} from "../app/js/ads-model.js";

test("statusForVerdict maps every adjustment verdict, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "note" never changes status: it stays whatever it was.
  assert.equal(statusForVerdict("note", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("note", "approved"), "approved");
});

test("round2/round1 round like the retired lib/common.ts", () => {
  assert.equal(round2(812.4019999), 812.4);
  assert.equal(round2(), 0);
  assert.equal(round1(33.94), 33.9);
});

test("totalsForDays computes spend/roas/acos_pct/cpc from the daily series, worked example", () => {
  const campaign = {
    daily: [
      { date: "2026-06-25", spend: 35.2, impressions: 900, clicks: 30, conversions: 5, revenue: 124.5 },
      { date: "2026-06-26", spend: 36.8, impressions: 940, clicks: 32, conversions: 4, revenue: 99.6 },
    ],
  };
  const totals = totalsForDays(campaign, 2);
  assert.equal(totals.spend, 72);
  assert.equal(totals.clicks, 62);
  assert.equal(totals.conversions, 9);
  assert.equal(totals.revenue, 224.1);
  // roas = revenue / spend = 224.1 / 72 = 3.1125 -> round2 = 3.11
  assert.equal(totals.roas, 3.11);
  // acos_pct = (spend / revenue) * 100 = (72 / 224.1) * 100 = 32.13.. -> round1 = 32.1
  assert.equal(totals.acos_pct, 32.1);
  // cpc = spend / clicks = 72 / 62 = 1.16..  -> round2 = 1.16
  assert.equal(totals.cpc, 1.16);
});

test("trendFor compares early vs late half ROAS and needs at least 4 days of data", () => {
  assert.equal(trendFor({ daily: [{ date: "2026-06-25", spend: 10, revenue: 10 }] }), "flat");
  const rising = {
    daily: [
      { date: "2026-06-25", spend: 10, revenue: 10 },
      { date: "2026-06-26", spend: 10, revenue: 10 },
      { date: "2026-06-27", spend: 10, revenue: 30 },
      { date: "2026-06-28", spend: 10, revenue: 30 },
    ],
  };
  assert.equal(trendFor(rising), "up");
});

test("detectAnomalies flags acos_breach for a campaign above target for the configured consecutive days", () => {
  const daily = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-06-${20 + index}`,
    spend: 30,
    impressions: 1000,
    clicks: 50,
    conversions: 5,
    revenue: 60, // ACOS = 30/60*100 = 50%, above a 25% target
  }));
  const snapshot = {
    currency: "USD",
    campaigns: [
      {
        campaign_id: "c1",
        platform: "amazon",
        status: "active",
        acos_target_pct: 25,
        daily,
        targets: [],
      },
    ],
  };
  const found = detectAnomalies(snapshot, { acos_breach_days: 3 }, 25);
  const breach = found.find((item) => item.type === "acos_breach");
  assert.ok(breach, "expected an acos_breach anomaly");
  assert.equal(breach.anomaly_id, "anm-acos_breach-c1");
  assert.equal(breach.severity, "critical"); // 50% > 25% * 1.5 = 37.5%
});

test("detectAnomalies flags zero_conversion_spend for an enabled target above the spend floor with 0 conversions", () => {
  const snapshot = {
    currency: "USD",
    campaigns: [
      {
        campaign_id: "c1",
        platform: "amazon",
        status: "active",
        daily: [],
        targets: [
          {
            target_id: "t1",
            type: "search_term",
            text: "lunch box kids",
            state: "enabled",
            spend_14d: 142,
            clicks: 86,
            conversions: 0,
          },
        ],
      },
    ],
  };
  const found = detectAnomalies(snapshot, { zero_conversion_spend_floor: 50 }, 25);
  const anomaly = found.find((item) => item.type === "zero_conversion_spend");
  assert.ok(anomaly);
  assert.equal(anomaly.anomaly_id, "anm-zero_conversion_spend-c1-t1");
  assert.equal(anomaly.severity, "critical"); // spend 142 >= spendFloor(50) * 2 = 100
});

test("detectAnomalies flags cpc_spike when the latest day's CPC is well above the trailing mean", () => {
  const daily = [
    { date: "2026-06-18", spend: 8.5, clicks: 10, revenue: 20, conversions: 1, impressions: 400 },
    { date: "2026-06-19", spend: 8.6, clicks: 10, revenue: 20, conversions: 1, impressions: 400 },
    { date: "2026-06-20", spend: 8.4, clicks: 10, revenue: 20, conversions: 1, impressions: 400 },
    { date: "2026-06-21", spend: 25.6, clicks: 20, revenue: 20, conversions: 1, impressions: 400 }, // CPC 1.28 vs ~0.85 mean
  ];
  const snapshot = {
    currency: "USD",
    campaigns: [{ campaign_id: "c1", platform: "amazon", status: "active", daily, targets: [] }],
  };
  const found = detectAnomalies(snapshot, { cpc_spike_pct: 40, cpc_trailing_days: 14 }, 25);
  const anomaly = found.find((item) => item.type === "cpc_spike");
  assert.ok(anomaly, "expected a cpc_spike anomaly");
  assert.equal(anomaly.anomaly_id, "anm-cpc_spike-c1");
});

test("detectAnomalies flags a rejected campaign and a rejected target", () => {
  const snapshot = {
    currency: "USD",
    campaigns: [
      {
        campaign_id: "c1",
        platform: "meta",
        status: "rejected",
        name: "Rejected Campaign",
        daily: [],
        targets: [{ target_id: "t1", type: "creative", text: "Reel v3", state: "rejected" }],
      },
    ],
  };
  const found = detectAnomalies(snapshot, {}, 25);
  assert.ok(found.some((item) => item.anomaly_id === "anm-rejected-c1"));
  assert.ok(found.some((item) => item.anomaly_id === "anm-rejected-c1-t1"));
});

test("skeletonAdjustment maps zero_conversion_spend on a search_term to a negative_keyword card", () => {
  const snapshot = {
    campaigns: [
      {
        campaign_id: "c1",
        name: "SP Manual",
        targets: [{ target_id: "t1", type: "search_term", text: "lunch box kids", match_type: "broad" }],
      },
    ],
  };
  const anomaly = {
    anomaly_id: "anm-zero_conversion_spend-c1-t1",
    type: "zero_conversion_spend",
    campaign_id: "c1",
    platform: "amazon",
    target_id: "t1",
    evidence: "$142.00 on 'lunch box kids' with 86 clicks and 0 orders in 14 days.",
  };
  const card = skeletonAdjustment(snapshot, anomaly, 7);
  assert.equal(card.adjustment_id, "adj-neg-c1-t1");
  assert.equal(card.type, "negative_keyword");
  assert.equal(card.status, "needs_review");
  assert.equal(card.ref, 7);
  assert.equal(card.target.text, "lunch box kids");
});

test("skeletonAdjustment maps rejected to a creative_refresh card", () => {
  const snapshot = { campaigns: [{ campaign_id: "c1", name: "IG Creative Test", targets: [] }] };
  const anomaly = {
    anomaly_id: "anm-rejected-c1",
    type: "rejected",
    campaign_id: "c1",
    platform: "meta",
    target_id: "",
    evidence: "Campaign 'IG Creative Test' is rejected by the platform.",
  };
  const card = skeletonAdjustment(snapshot, anomaly, 1);
  assert.equal(card.type, "creative_refresh");
  assert.equal(card.adjustment_id, "adj-refresh-c1");
});

test("operationFor maps every adjustment type to its concrete outside-the-app operation, ported from execute_decisions.ts", () => {
  assert.equal(
    operationFor({
      type: "negative_keyword",
      campaign_id: "c1",
      platform: "amazon",
      target: { text: "lunch box kids" },
    }).operation,
    "add_negative_keyword",
  );
  assert.equal(
    operationFor({
      type: "bid_down",
      campaign_id: "c1",
      platform: "amazon",
      current_value: "$1.35",
      proposed_value: "$1.15",
    }).operation,
    "set_bid",
  );
  assert.equal(
    operationFor({ type: "pause_target", campaign_id: "c1", platform: "tiktok", target: { id: "t1" } }).operation,
    "pause_target",
  );
  assert.equal(
    operationFor({ type: "budget_shift", campaign_id: "c1", platform: "tiktok", target: { id: "g-brand" } }).target
      .to_campaign_id,
    "c1",
  );
  assert.equal(
    operationFor({ type: "creative_refresh", campaign_id: "c1", platform: "meta", target: {} }).operation,
    "refresh_creative",
  );
  assert.equal(operationFor({ type: "unknown_type", target: {} }).operation, "unknown_type");
});

test("normalizeCampaign parses daily/targets JSON from a Busabase text field", () => {
  const campaign = normalizeCampaign({
    campaign_id: "c1",
    platform: "amazon",
    daily: JSON.stringify([
      { date: "2026-06-25", spend: 10, impressions: 100, clicks: 5, conversions: 1, revenue: 20 },
    ]),
    targets: JSON.stringify([{ target_id: "t1", text: "kw" }]),
  });
  assert.equal(campaign.daily.length, 1);
  assert.equal(campaign.targets.length, 1);
  assert.equal(campaign.targets[0].target_id, "t1");
});

test("normalizeAdjustment parses evidence/target JSON and builds decision/execution from flat fields", () => {
  const adjustment = normalizeAdjustment({
    adjustment_id: "adj-1",
    ref: 3,
    evidence: JSON.stringify(["line one", "line two"]),
    target: JSON.stringify({ kind: "term", id: "t1" }),
    decision_verdict: "approve",
    decision_note: "go ahead",
    decided_at: "2026-07-01T00:00:00.000Z",
    execution_status: "planned",
    execution_operation: "add_negative_keyword",
    execution_target: JSON.stringify({ platform: "amazon" }),
    execution_detail: "detail",
    executed_at: "2026-07-02T00:00:00.000Z",
  });
  assert.equal(adjustment.ref, 3);
  assert.deepEqual(adjustment.evidence, ["line one", "line two"]);
  assert.deepEqual(adjustment.target, { kind: "term", id: "t1" });
  assert.deepEqual(adjustment.decision, {
    verdict: "approve",
    note: "go ahead",
    decided_at: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(adjustment.execution.operation, "add_negative_keyword");
});

test("normalizeAdjustment leaves decision/execution null when no verdict/execution has been recorded", () => {
  const adjustment = normalizeAdjustment({ adjustment_id: "adj-1" });
  assert.equal(adjustment.decision, null);
  assert.equal(adjustment.execution, null);
  assert.equal(adjustment.status, "needs_review");
});

test("normalizeAnomaly defaults every field so a sparse Busabase row never throws", () => {
  const anomaly = normalizeAnomaly({});
  assert.equal(anomaly.anomaly_id, "");
  assert.equal(anomaly.state, "open");
});

test("configFromSettings parses per_product/per_platform JSON with safe fallbacks", () => {
  const config = configFromSettings({
    default_acos_pct: 20,
    per_platform_targets: JSON.stringify({ google: { acos_pct: 18 } }),
    per_product_targets: JSON.stringify([{ sku: "NH-LB-01", acos_pct: 22 }]),
    acos_breach_days: 5,
  });
  assert.equal(config.targets.default_acos_pct, 20);
  assert.equal(config.targets.per_platform.google.acos_pct, 18);
  assert.equal(config.targets.per_product[0].sku, "NH-LB-01");
  assert.equal(config.thresholds.acos_breach_days, 5);
});

test("configFromSettings falls back to defaults when settings JSON is malformed", () => {
  const config = configFromSettings({ per_platform_targets: "{not json", per_product_targets: "" });
  assert.deepEqual(config.targets.per_platform, {});
  assert.deepEqual(config.targets.per_product, []);
});

test("recomputeDerived resolves the effective ACOS target: per-product beats per-platform beats default", () => {
  const snapshot = {
    campaigns: [
      { campaign_id: "c1", platform: "amazon", sku: "NH-LB-01", daily: [] },
      { campaign_id: "c2", platform: "google", sku: "", daily: [] },
      { campaign_id: "c3", platform: "tiktok", sku: "", daily: [] },
    ],
    platforms: [],
    anomalies: [],
    adjustments: [],
  };
  const config = {
    targets: {
      default_acos_pct: 25,
      per_product: [{ sku: "NH-LB-01", acos_pct: 22 }],
      per_platform: { google: { acos_pct: 18 } },
    },
    thresholds: {},
  };
  recomputeDerived(snapshot, config);
  assert.equal(snapshot.campaigns[0].acos_target_pct, 22);
  assert.equal(snapshot.campaigns[1].acos_target_pct, 18);
  assert.equal(snapshot.campaigns[2].acos_target_pct, 25);
});

test("recomputeDerived rolls up platform spend/revenue/roas/acos from its campaigns", () => {
  const daily = [{ date: "2026-06-25", spend: 100, impressions: 2000, clicks: 100, conversions: 10, revenue: 400 }];
  const snapshot = {
    campaigns: [
      { campaign_id: "c1", platform: "amazon", status: "active", daily, sku: "" },
      { campaign_id: "c2", platform: "amazon", status: "active", daily, sku: "" },
    ],
    platforms: [{ platform_id: "amazon", name: "Amazon Ads" }],
    anomalies: [],
    adjustments: [],
  };
  recomputeDerived(snapshot, { targets: { default_acos_pct: 25 }, thresholds: {} });
  const platform = snapshot.platforms[0];
  assert.equal(platform.campaign_count, 2);
  assert.equal(platform.spend_14d, 200);
  assert.equal(platform.revenue_14d, 800);
  assert.equal(platform.roas, 4);
  assert.equal(platform.acos_pct, 25);
});

test("recomputeDerived flags budget_at_risk_today for active campaigns at/above the budget_risk_pct threshold", () => {
  const snapshot = {
    campaigns: [
      { campaign_id: "c1", platform: "amazon", status: "active", budget_spent_today_pct: 90, daily: [] },
      { campaign_id: "c2", platform: "amazon", status: "active", budget_spent_today_pct: 40, daily: [] },
      { campaign_id: "c3", platform: "amazon", status: "paused", budget_spent_today_pct: 95, daily: [] },
    ],
    platforms: [],
    anomalies: [],
    adjustments: [],
  };
  recomputeDerived(snapshot, { targets: { default_acos_pct: 25 }, thresholds: { budget_risk_pct: 85 } });
  assert.equal(snapshot.metrics.budget_at_risk_today, 1);
});

test("buildSnapshot normalizes raw Busabase rows and emits a no-snapshot warning only when nothing is configured yet", () => {
  const empty = buildSnapshot({});
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.warnings[0].id, "no-snapshot");

  const withCampaigns = buildSnapshot({
    campaigns: [
      {
        campaign_id: "c1",
        platform: "amazon",
        status: "active",
        daily: JSON.stringify([]),
        targets: JSON.stringify([]),
      },
    ],
  });
  assert.equal(withCampaigns.warnings.length, 0);
  assert.equal(withCampaigns.campaigns[0].campaign_id, "c1");
});

test("buildSnapshot preserves spend_last_month from the settings row through recomputeDerived's metrics spread", () => {
  const snapshot = buildSnapshot({ settings: { spend_last_month: 5840.22 } });
  assert.equal(snapshot.metrics.spend_last_month, 5840.22);
});

test("buildConfigSummary derives the platform roster and thresholds without any secret-readiness booleans", () => {
  const summary = buildConfigSummary({
    platforms: [{ platform_id: "amazon", name: "Amazon Ads US", account_id: "ENTITY-NH-7301" }],
    settings: { currency: "USD", default_acos_pct: 25, acos_breach_days: 3 },
  });
  assert.equal(summary.platforms.length, 1);
  assert.equal(summary.platforms[0].account_id, "ENTITY-NH-7301");
  assert.equal(summary.targets.default_acos_pct, 25);
  assert.equal(summary.thresholds.acos_breach_days, 3);
  assert.equal("secret_envs" in summary.platforms[0], false);
});
