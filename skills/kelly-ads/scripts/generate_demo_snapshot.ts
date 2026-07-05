#!/usr/bin/env node
// Writes a small example snapshot to app/.data/ads_snapshot.json so the app
// and validator can be exercised without real platform data.
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import { ensureDirs, recomputeDerived, round2, writeJson } from "../app/server/store.ts";
import type { AdsSnapshot } from "../app/server/types.ts";

const now = new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

function dayAt(offsetFromEnd, total = 14) {
  return new Date(Date.now() - (total - 1 - offsetFromEnd) * DAY_MS).toISOString().slice(0, 10);
}

function makeDaily(spends, cpc, cvr, aov) {
  return spends.map((spend, index) => {
    const clicks = spend > 0 ? Math.max(1, Math.round(spend / cpc)) : 0;
    const conversions = Math.round(clicks * cvr);
    return {
      date: dayAt(index, spends.length),
      spend: round2(spend),
      impressions: clicks ? Math.round(clicks / 0.02) : 0,
      clicks,
      conversions,
      revenue: round2(conversions * aov),
    };
  });
}

const campaigns = [
  {
    campaign_id: "amz-example-auto",
    platform: "amazon",
    name: "SP Auto — Example Product",
    product: "Example Product",
    sku: "EX-01",
    status: "active",
    daily_budget: 30,
    budget_spent_today_pct: 52,
    acos_target_pct: 25,
    currency: "USD",
    daily: makeDaily([24, 25, 26, 24, 27, 26, 25, 24, 26, 27, 25, 26, 27, 26], 0.9, 0.15, 25),
    targets: [
      {
        target_id: "ex-term-good",
        type: "search_term",
        text: "example product",
        match_type: "broad",
        state: "enabled",
        spend_14d: 120.4,
        clicks: 130,
        conversions: 21,
        revenue: 525.0,
        cpc: 0.93,
        acos_pct: 22.9,
      },
      {
        target_id: "ex-term-bad",
        type: "search_term",
        text: "example product, cheap",
        match_type: "broad",
        state: "enabled",
        spend_14d: 61.2,
        clicks: 70,
        conversions: 0,
        revenue: 0,
        cpc: 0.87,
        acos_pct: 0,
      },
    ],
    last_sync_at: now,
  },
  {
    campaign_id: "meta-example-test",
    platform: "meta",
    name: "IG Test — Example Product",
    product: "Example Product",
    sku: "EX-01",
    status: "active",
    daily_budget: 15,
    budget_spent_today_pct: 38,
    acos_target_pct: 30,
    currency: "USD",
    daily: makeDaily([12, 13, 12, 14, 13, 12, 13, 14, 12, 13, 14, 13, 12, 13], 0.5, 0.05, 25),
    targets: [
      {
        target_id: "ex-creative-1",
        type: "creative",
        text: "Example Reel v1",
        match_type: "",
        state: "enabled",
        spend_14d: 178.0,
        clicks: 356,
        conversions: 18,
        revenue: 450.0,
        cpc: 0.5,
        acos_pct: 39.6,
      },
    ],
    last_sync_at: now,
  },
];

const anomalies = [
  {
    anomaly_id: "anm-zero_conversion_spend-amz-example-auto-ex-term-bad",
    type: "zero_conversion_spend",
    severity: "warning",
    state: "open",
    campaign_id: "amz-example-auto",
    platform: "amazon",
    target_id: "ex-term-bad",
    evidence: "USD 61.20 on 'example product, cheap' with 70 clicks and 0 orders in 14 days.",
    detected_at: now,
    first_seen_at: now,
    adjustment_id: "adj-example-negative",
  },
];

const adjustments = [
  {
    adjustment_id: "adj-example-negative",
    ref: 1,
    type: "negative_keyword",
    title: "Add 'example product, cheap' as a negative keyword",
    status: "needs_review",
    campaign_id: "amz-example-auto",
    platform: "amazon",
    target: { kind: "term", id: "ex-term-bad", text: "example product, cheap" },
    current_value: "Broad-match term, enabled",
    proposed_value: "Negative exact on SP Auto — Example Product",
    reason: "The term spends without converting while sibling terms convert at ~16%.",
    evidence: ["USD 61.20 spend, 70 clicks, 0 orders over the last 14 days."],
    expected_impact: "Saves ~USD 30/week with no expected revenue loss.",
    anomaly_id: "anm-zero_conversion_spend-amz-example-auto-ex-term-bad",
    note: "",
    created_at: now,
    decision: null,
    execution: null,
  },
];

const snapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-ads-demo",
  currency: "USD",
  range: { start: dayAt(0), end: dayAt(13) },
  targets: { acos_target_pct: 25, roas_target: 4 },
  metrics: { spend_last_month: 1180.5 },
  platforms: [
    {
      platform_id: "amazon",
      name: "Amazon Ads US",
      account_id: "ENTITY-EXAMPLE",
      status: "ok",
      currency: "USD",
      last_sync_at: now,
    },
    {
      platform_id: "meta",
      name: "Meta Ads",
      account_id: "act_000000000",
      status: "ok",
      currency: "USD",
      last_sync_at: now,
    },
  ],
  campaigns,
  anomalies,
  adjustments,
  sync_log: [
    {
      sync_id: `sync-amazon-${now.slice(0, 10)}`,
      at: now,
      platform: "amazon",
      kind: "ingest",
      message: "Amazon Ads example report ingested: 1 campaign, 14 days.",
      rows: 14,
    },
    {
      sync_id: `sync-meta-${now.slice(0, 10)}`,
      at: now,
      platform: "meta",
      kind: "ingest",
      message: "Meta Ads example report ingested: 1 campaign, 14 days.",
      rows: 14,
    },
  ],
  warnings: [],
} as unknown as AdsSnapshot;

recomputeDerived(snapshot, { targets: { default_acos_pct: 25 }, thresholds: { budget_risk_pct: 85 } });
await ensureDirs();
await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
