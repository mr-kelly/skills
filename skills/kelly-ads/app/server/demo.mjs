// Deterministic mock data for documentation and screenshots.
// Persona: "Nimbus Home", a cross-border home & kitchen gadget seller running
// Amazon Ads US, Meta (IG), TikTok Ads, and Google Ads.
// Demo mode never reads or writes files under app/.data/.
import { recomputeDerived, round1, round2 } from "./store.mjs";

const now = "2026-07-02T09:30:00.000Z";
const START = "2026-06-19";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "").toLowerCase().startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-ads",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-ads/config.json",
      is_example: false,
      currency: "USD",
      targets: { default_acos_pct: 25, default_roas: 4 },
      thresholds: {
        acos_breach_days: 3,
        budget_exhausted_pct: 100,
        zero_conversion_spend_floor: 50,
        cpc_spike_pct: 40,
        budget_risk_pct: 85
      },
      platforms: snapshot.platforms.map((platform) => ({
        platform_id: platform.platform_id,
        name: platform.name,
        account_id: platform.account_id,
        secret_envs: [`KELLY_ADS_${platform.platform_id.toUpperCase()}_TOKEN_DEMO`],
        secrets_ready: true
      }))
    },
    snapshot
  };
}

function dayAt(index) {
  const base = Date.parse(`${START}T00:00:00.000Z`);
  return new Date(base + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeDaily(spends, cpc, cvr, aov) {
  return spends.map((spend, index) => {
    const unitCpc = Array.isArray(cpc) ? cpc[index] : cpc;
    const clicks = spend > 0 ? Math.max(1, Math.round(spend / unitCpc)) : 0;
    const conversions = Math.round(clicks * cvr);
    return {
      date: dayAt(index),
      spend: round2(spend),
      impressions: clicks ? Math.round(clicks / 0.022) : 0,
      clicks,
      conversions,
      revenue: round2(conversions * aov)
    };
  });
}

function target(target_id, type, text, match_type, state, spend_14d, clicks, conversions, revenue) {
  return {
    target_id,
    type,
    text,
    match_type,
    state,
    spend_14d: round2(spend_14d),
    clicks,
    conversions,
    revenue: round2(revenue),
    cpc: clicks > 0 ? round2(spend_14d / clicks) : 0,
    acos_pct: revenue > 0 ? round1((spend_14d / revenue) * 100) : 0
  };
}

function campaign(campaign_id, platform, name, product, sku, status, daily_budget, budget_spent_today_pct, acos_target_pct, daily, targets) {
  return {
    campaign_id,
    platform,
    name,
    product,
    sku,
    status,
    daily_budget,
    budget_spent_today_pct,
    acos_target_pct,
    currency: "USD",
    daily,
    targets,
    last_sync_at: now
  };
}

function demoCampaigns() {
  return [
    campaign("amz-sp-auto-lunchbox", "amazon", "SP Auto — Silicone Bento Lunchbox", "Silicone Bento Lunchbox", "NH-LB-01", "active", 35, 54, 25,
      makeDaily([26.4, 27.8, 28.2, 26.1, 29.4, 30.2, 27.5, 26.8, 28.9, 29.6, 27.2, 28.4, 30.1, 28.6], 0.95, 0.16, 24.9),
      [
        target("amz-lb-auto-close", "search_term", "close-match: bento lunch box", "auto", "enabled", 148.5, 152, 25, 622.5),
        target("amz-lb-auto-sub", "search_term", "substitutes: leakproof lunch containers", "auto", "enabled", 96.1, 101, 15, 373.5),
        target("amz-lb-auto-comp", "search_term", "complements: kids water bottle", "auto", "enabled", 44.9, 48, 4, 99.6)
      ]),
    campaign("amz-sp-manual-lunchbox", "amazon", "SP Manual — Lunchbox Keywords", "Silicone Bento Lunchbox", "NH-LB-01", "active", 45, 88, 25,
      makeDaily([35.2, 36.8, 37.4, 38.1, 36.5, 37.9, 38.6, 36.2, 37.1, 38.4, 37.7, 36.9, 38.2, 37.5], 1.35, 0.16, 24.9),
      [
        target("amz-lb-kw-kids-bento", "search_term", "kids bento box", "broad", "enabled", 96.4, 74, 14, 348.6),
        target("amz-lb-kw-silicone", "search_term", "silicone lunch box", "phrase", "enabled", 88.2, 66, 11, 273.9),
        target("amz-lb-kw-lunchbox-kids", "search_term", "lunch box kids", "broad", "enabled", 142.0, 86, 0, 0),
        target("amz-lb-kw-adult", "search_term", "bento box adult", "broad", "enabled", 41.3, 30, 3, 74.7)
      ]),
    campaign("amz-sp-auto-spicerack", "amazon", "SP Auto — Rotating Spice Rack", "Rotating Spice Rack", "NH-SR-02", "active", 25, 71, 25,
      makeDaily(
        [18.2, 18.9, 17.6, 19.1, 18.4, 19.6, 18.8, 19.3, 20.1, 21.4, 23.8, 26.2, 28.4, 29.1],
        [0.85, 0.86, 0.84, 0.87, 0.85, 0.88, 0.86, 0.87, 0.9, 0.98, 1.08, 1.16, 1.24, 1.28],
        0.11, 32.5),
      [
        target("amz-sr-organizer", "search_term", "spice rack organizer", "auto", "enabled", 121.8, 95, 12, 390.0),
        target("amz-sr-rotating", "search_term", "rotating spice rack", "auto", "enabled", 108.6, 88, 9, 292.5),
        target("amz-sr-magnetic", "search_term", "magnetic spice rack", "auto", "enabled", 45.2, 40, 2, 65.0)
      ]),
    campaign("amz-sb-brand", "amazon", "SB — Nimbus Home Storefront", "Nimbus Home Store", "", "active", 15, 47, 28,
      makeDaily([11.2, 12.1, 11.8, 12.4, 11.5, 12.8, 12.2, 11.9, 12.6, 12.3, 11.7, 12.5, 12.9, 12.4], 1.1, 0.18, 27),
      [
        target("amz-sb-nimbus", "search_term", "nimbus home", "exact", "enabled", 52.4, 44, 9, 243.0),
        target("amz-sb-bento-brand", "search_term", "bento box set", "phrase", "enabled", 41.6, 36, 5, 135.0)
      ]),
    campaign("meta-ig-creative-test", "meta", "IG Creative Test — Lunchbox Reels", "Silicone Bento Lunchbox", "NH-LB-01", "active", 25, 40, 30,
      makeDaily([19.2, 20.4, 19.8, 20.9, 19.5, 20.2, 21.1, 19.7, 20.6, 20.1, 19.9, 20.8, 20.3, 19.6], 0.55, 0.035, 24.9),
      [
        target("meta-reel-v1", "creative", "Lunchbox Reel v1 — packing hack", "", "enabled", 92.5, 168, 6, 149.4),
        target("meta-reel-v2", "creative", "Lunchbox Reel v2 — school morning", "", "enabled", 88.1, 162, 4, 99.6),
        target("meta-reel-v3", "creative", "Before/After Reel v3", "", "rejected", 54.3, 98, 0, 0)
      ]),
    campaign("meta-retargeting", "meta", "Meta Retargeting — Site Visitors", "Nimbus Home Store", "", "active", 18, 62, 28,
      makeDaily([14.2, 15.1, 14.8, 15.4, 14.5, 15.8, 15.2, 14.9, 15.6, 15.3, 14.7, 15.5, 15.9, 15.4], 0.62, 0.09, 26),
      [
        target("meta-rt-visitors", "audience", "Site visitors 30d", "", "enabled", 132.4, 210, 19, 494.0),
        target("meta-rt-cart", "audience", "Cart abandoners 14d", "", "enabled", 78.9, 126, 12, 312.0)
      ]),
    campaign("tt-spark-lunchbox", "tiktok", "Spark Ads — Viral Lunchbox Video", "Silicone Bento Lunchbox", "NH-LB-01", "active", 30, 100, 30,
      makeDaily([30, 30, 30, 28.4, 30, 30, 30, 30, 29.1, 30, 30, 30, 30, 30], 0.32, 0.05, 24.9),
      [
        target("tt-spark-video", "creative", "Spark — @lunchboxdad packing video", "", "enabled", 417.5, 1298, 65, 1618.5)
      ]),
    campaign("tt-interest-test", "tiktok", "Interest Test — Kitchen Gadgets", "Rotating Spice Rack", "NH-SR-02", "paused", 12, 0, 30,
      makeDaily([12, 12.5, 12, 12.5, 12, 12.5, 12.5, 0, 0, 0, 0, 0, 0, 0], 0.28, 0, 24.9),
      [
        target("tt-interest-kitchen", "audience", "Interest — Kitchen & Dining", "", "paused", 86.0, 307, 0, 0)
      ]),
    campaign("g-brand-search", "google", "Brand Search — nimbus home", "Nimbus Home Store", "", "active", 20, 44, 20,
      makeDaily([8.4, 9.1, 8.8, 9.4, 8.6, 9.2, 9.6, 8.9, 9.3, 9.5, 8.7, 9.0, 9.4, 9.2], 0.5, 0.3, 26),
      [
        target("g-brand-nimbus", "search_term", "nimbus home", "exact", "enabled", 84.2, 168, 50, 1300.0),
        target("g-brand-bento", "search_term", "nimbus bento box", "phrase", "enabled", 42.1, 84, 26, 676.0)
      ]),
    campaign("g-pmax", "google", "Performance Max — Kitchen Gadgets", "Nimbus Home Store", "", "active", 25, 58, 30,
      makeDaily([21.4, 22.1, 21.8, 22.6, 21.5, 22.4, 22.9, 21.7, 22.3, 22.8, 21.9, 22.5, 23.1, 22.6], 0.75, 0.07, 28),
      [
        target("g-pmax-kitchen", "asset_group", "Kitchen Gadgets — all products", "", "enabled", 311.6, 415, 29, 812.0)
      ])
  ];
}

function demoPlatforms() {
  return [
    platform("amazon", "Amazon Ads US", "ENTITY-NH-7301", "ok", "2026-07-02T07:45:00.000Z"),
    platform("meta", "Meta Ads — Nimbus Home", "act_298401776", "warning", "2026-07-02T07:52:00.000Z"),
    platform("tiktok", "TikTok Ads", "adv-7723014882", "ok", "2026-07-02T07:58:00.000Z"),
    platform("google", "Google Ads", "734-201-8859", "ok", "2026-07-02T08:04:00.000Z")
  ];
}

function platform(platform_id, name, account_id, status, last_sync_at) {
  return {
    platform_id,
    name,
    account_id,
    status,
    currency: "USD",
    last_sync_at,
    campaign_count: 0,
    spend_14d: 0,
    revenue_14d: 0,
    conversions_14d: 0,
    roas: 0,
    acos_pct: 0
  };
}

function anomaly(anomaly_id, type, severity, state, campaign_id, platformId, target_id, evidence, detected_at, first_seen_at, adjustment_id) {
  return {
    anomaly_id,
    type,
    severity,
    state,
    campaign_id,
    platform: platformId,
    target_id,
    evidence,
    detected_at,
    first_seen_at,
    adjustment_id
  };
}

function demoAnomalies() {
  return [
    anomaly("anm-zeroconv-lunchbox-kids", "zero_conversion_spend", "critical", "open", "amz-sp-manual-lunchbox", "amazon", "amz-lb-kw-lunchbox-kids",
      "$142.00 on 'lunch box kids' with 86 clicks and 0 orders in 14 days.",
      "2026-07-02T08:10:00.000Z", "2026-06-27T08:10:00.000Z", "adj-neg-lunchbox-kids"),
    anomaly("anm-acos-lunchbox-manual", "acos_breach", "warning", "open", "amz-sp-manual-lunchbox", "amazon", "",
      "ACOS 33.9% vs 25% target for 7 consecutive days.",
      "2026-07-02T08:10:00.000Z", "2026-06-29T08:10:00.000Z", "adj-bid-down-lunchbox"),
    anomaly("anm-budget-tt-spark", "budget_exhausted", "warning", "actioned", "tt-spark-lunchbox", "tiktok", "",
      "Daily budget $30 fully spent by ~2pm local on 6 of the last 7 days.",
      "2026-07-02T08:10:00.000Z", "2026-06-26T08:10:00.000Z", "adj-budget-shift-tt"),
    anomaly("anm-rejected-meta-reel", "rejected", "critical", "open", "meta-ig-creative-test", "meta", "meta-reel-v3",
      "Ad 'Before/After Reel v3' rejected: personal health claim (before/after imagery).",
      "2026-07-02T07:52:00.000Z", "2026-07-01T14:20:00.000Z", "adj-creative-refresh-meta"),
    anomaly("anm-cpc-spike-spicerack", "cpc_spike", "warning", "open", "amz-sp-auto-spicerack", "amazon", "",
      "CPC $1.28 on Jul 2 vs $0.87 trailing 14-day mean (+47%) after a competitor launch.",
      "2026-07-02T08:10:00.000Z", "2026-06-30T08:10:00.000Z", ""),
    anomaly("anm-zeroconv-tt-interest", "zero_conversion_spend", "warning", "actioned", "tt-interest-test", "tiktok", "tt-interest-kitchen",
      "$86.00 on audience 'Interest — Kitchen & Dining' with 307 clicks and 0 orders.",
      "2026-06-26T08:10:00.000Z", "2026-06-24T08:10:00.000Z", "adj-pause-tt-interest"),
    anomaly("anm-acos-pmax", "acos_breach", "info", "dismissed", "g-pmax", "google", "",
      "ACOS 38.5% vs 30% campaign target; expected while the PMax asset group is learning.",
      "2026-06-30T08:10:00.000Z", "2026-06-28T08:10:00.000Z", "")
  ];
}

function adjustment(adjustment_id, ref, type, title, status, campaign_id, platformId, targetObj, current_value, proposed_value, reason, evidence, expected_impact, anomaly_id, note, decision, execution) {
  return {
    adjustment_id,
    ref,
    type,
    title,
    status,
    campaign_id,
    platform: platformId,
    target: targetObj,
    current_value,
    proposed_value,
    reason,
    evidence,
    expected_impact,
    anomaly_id,
    note,
    created_at: "2026-07-02T08:10:00.000Z",
    decision,
    execution
  };
}

function demoAdjustments() {
  return [
    adjustment("adj-neg-lunchbox-kids", 1, "negative_keyword",
      "Add 'lunch box kids' as a negative exact keyword", "needs_review",
      "amz-sp-manual-lunchbox", "amazon",
      { kind: "term", id: "amz-lb-kw-lunchbox-kids", text: "lunch box kids" },
      "Broad-match term, enabled", "Negative exact on SP Manual — Lunchbox Keywords",
      "The search term burns spend with zero conversions while sibling terms convert at 14-16%.",
      [
        "$142.00 spend, 86 clicks, 0 orders over the last 14 days.",
        "Sibling terms 'kids bento box' and 'silicone lunch box' convert at 18.9% and 16.7%.",
        "Search-term report shows most clicks land on a generic character-lunchbox results page."
      ],
      "Saves about $70/week with no expected revenue loss; campaign ACOS −4 to −5 points.",
      "anm-zeroconv-lunchbox-kids", "", null, null),
    adjustment("adj-bid-down-lunchbox", 2, "bid_down",
      "Lower bids 15% on SP Manual — Lunchbox Keywords", "needs_review",
      "amz-sp-manual-lunchbox", "amazon",
      { kind: "campaign", id: "amz-sp-manual-lunchbox", text: "all enabled keywords" },
      "$1.35 avg CPC bid", "$1.15 avg CPC bid (−15%)",
      "Campaign ACOS has been above the 25% target for 7 straight days and CPC is the driver, not conversion rate.",
      [
        "ACOS 33.9% for the trailing 7 days vs 25% target.",
        "Conversion rate is stable at ~16%; average CPC rose from $1.18 to $1.35 in two weeks.",
        "Top-of-search impression share stays above 60% down to a $1.10 bid in the bid simulator."
      ],
      "ACOS back toward ~27-28% at similar order volume; roughly −$32/week spend.",
      "anm-acos-lunchbox-manual", "", null, null),
    adjustment("adj-budget-shift-tt", 3, "budget_shift",
      "Shift $10/day from Google Brand Search to TikTok Spark Ads", "approved",
      "tt-spark-lunchbox", "tiktok",
      { kind: "budget", id: "g-brand-search", text: "→ tt-spark-lunchbox" },
      "Google Brand $20/day (spending ~$9) · TikTok $30/day (capped)", "Google Brand $10/day · TikTok $40/day",
      "TikTok Spark Ads exhausts its budget by early afternoon at ROAS 3.9 while Google Brand Search cannot spend half its budget.",
      [
        "TikTok budget fully spent by ~2pm on 6 of the last 7 days at ROAS 3.9.",
        "Google Brand Search spends only ~$9 of its $20 daily budget (branded volume is the ceiling).",
        "Spark video engagement is still climbing; comments and saves grew 22% week over week."
      ],
      "About +$10/day productive spend at ~ROAS 3.5-4.0; no loss on brand coverage.",
      "anm-budget-tt-spark", "Approved. Shift it and watch ROAS for 3 days.",
      { verdict: "approve", note: "Approved. Shift it and watch ROAS for 3 days.", decided_at: "2026-07-02T09:05:00.000Z" }, null),
    adjustment("adj-creative-refresh-meta", 4, "creative_refresh",
      "Replace the rejected Meta reel with compliant UGC creative", "blocked",
      "meta-ig-creative-test", "meta",
      { kind: "creative", id: "meta-reel-v3", text: "Before/After Reel v3" },
      "Before/After Reel v3 (rejected)", "New UGC packing-routine reel, no before/after claims",
      "Meta rejected the reel for before/after imagery under personal-health ad rules; the test cell is now unspendable.",
      [
        "Rejection reason: 'Personal health and appearance' policy, before/after framing.",
        "The rejected cell held 27% of the test budget; remaining reels reallocate automatically.",
        "Appeal is unlikely to succeed: the policy match is accurate for this cut."
      ],
      "Restores the third test cell (~$7/day) and removes the account-quality flag risk.",
      "anm-rejected-meta-reel", "Blocked until the new UGC creative batch lands (due Jul 8).",
      { verdict: "block", note: "Blocked until the new UGC creative batch lands (due Jul 8).", decided_at: "2026-07-01T16:40:00.000Z" }, null),
    adjustment("adj-pause-tt-interest", 5, "pause_target",
      "Pause the TikTok Kitchen & Dining interest ad group", "done",
      "tt-interest-test", "tiktok",
      { kind: "term", id: "tt-interest-kitchen", text: "Interest — Kitchen & Dining" },
      "Ad group enabled, $12/day", "Ad group paused",
      "The interest ad group spent $86 across 307 clicks with zero conversions; the traffic quality does not match the product.",
      [
        "$86.00 spend, 307 clicks, 0 orders since June 19.",
        "Click-through comes mostly from broad entertainment placements, not shopping intent.",
        "Spark Ads on the same product converts at 5%; that is where the budget should live."
      ],
      "Stops ~$12/day of unproductive spend immediately.",
      "anm-zeroconv-tt-interest", "Approved, pause it.",
      { verdict: "approve", note: "Approved, pause it.", decided_at: "2026-06-26T10:12:00.000Z" },
      {
        status: "executed",
        operation: "pause_target",
        target: { platform: "tiktok", campaign_id: "tt-interest-test", ad_group: "Interest — Kitchen & Dining" },
        detail: "Paused via TikTok Ads API by the agent on approval; spend stopped the same day.",
        executed_at: "2026-06-26T10:30:00.000Z"
      }),
    adjustment("adj-bid-up-lunchbox-auto", 6, "bid_up",
      "Raise bids 10% on SP Auto — Silicone Bento Lunchbox", "changes_requested",
      "amz-sp-auto-lunchbox", "amazon",
      { kind: "campaign", id: "amz-sp-auto-lunchbox", text: "close-match auto targets" },
      "$0.95 avg CPC bid", "$1.05 avg CPC bid (+10%)",
      "The auto campaign runs at ACOS ~23% under the 25% target and loses impression share overnight when the budget paces out.",
      [
        "ROAS 4.3 / ACOS 23.3% over the last 14 days, under the 25% target.",
        "Lost impression share (budget) averages 18% between 8pm and midnight.",
        "Close-match targets drive 25 of 44 orders; substitutes stay profitable at current bids."
      ],
      "Roughly +15% impressions on close-match; ACOS expected to stay under target.",
      "", "Show projected daily spend at +10% before I approve.",
      { verdict: "request_changes", note: "Show projected daily spend at +10% before I approve.", decided_at: "2026-07-02T09:10:00.000Z" }, null)
  ];
}

function demoSyncLog() {
  return [
    sync("sync-amazon-0702", "2026-07-02T07:45:00.000Z", "amazon", "ingest", "Amazon Ads report ingested: 4 campaigns, 14 days, 12 search terms.", 56),
    sync("sync-meta-0702", "2026-07-02T07:52:00.000Z", "meta", "ingest", "Meta Ads insights ingested: 2 campaigns, 14 days, 5 creatives/audiences.", 28),
    sync("sync-tiktok-0702", "2026-07-02T07:58:00.000Z", "tiktok", "ingest", "TikTok Ads report ingested: 2 campaigns, 14 days.", 28),
    sync("sync-google-0702", "2026-07-02T08:04:00.000Z", "google", "ingest", "Google Ads report ingested: 2 campaigns, 14 days, 3 asset groups/terms.", 28),
    sync("sync-checks-0702", "2026-07-02T08:10:00.000Z", "", "checks", "Anomaly checks completed: 7 anomalies (2 critical), 1 skeleton adjustment drafted.", 0),
    sync("sync-exec-0626", "2026-06-26T10:30:00.000Z", "tiktok", "execution", "Adjustment #5 executed: paused TikTok interest ad group.", 0)
  ];
}

function sync(sync_id, at, platformId, kind, message, rows) {
  return { sync_id, at, platform: platformId, kind, message, rows };
}

function demoSnapshot(scenario) {
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-ads-demo",
    currency: "USD",
    range: { start: START, end: "2026-07-02" },
    targets: { acos_target_pct: 25, roas_target: 4 },
    metrics: { spend_last_month: 5840.22 },
    platforms: demoPlatforms(),
    campaigns: demoCampaigns(),
    anomalies: demoAnomalies(),
    adjustments: demoAdjustments(),
    sync_log: demoSyncLog(),
    warnings: ["overview", "alerts"].includes(scenario) ? [
      {
        id: "meta-rejected-reel",
        severity: "warning",
        campaign_id: "meta-ig-creative-test",
        message: "Meta rejected 'Before/After Reel v3'; the creative test is running on 2 of 3 cells.",
        detail: "Demo warning, no live platform data was read."
      }
    ] : []
  };
  recomputeDerived(snapshot, { targets: { default_acos_pct: 25 }, thresholds: { budget_risk_pct: 85 } });
  return snapshot;
}

function localizeSnapshotZh(snapshot) {
  const anomalyText = {
    "anm-zeroconv-lunchbox-kids": "搜索词 “lunch box kids” 14 天花费 $142.00、86 次点击、0 笔订单。",
    "anm-acos-lunchbox-manual": "ACOS 33.9%，已连续 7 天高于 25% 目标。",
    "anm-budget-tt-spark": "最近 7 天中有 6 天日预算 $30 在当地时间下午 2 点前花光。",
    "anm-rejected-meta-reel": "广告 “Before/After Reel v3” 被拒：个人健康类前后对比素材违规。",
    "anm-cpc-spike-spicerack": "7 月 2 日 CPC $1.28，较 14 天均值 $0.87 上涨 47%——竞品新上架后出现。",
    "anm-zeroconv-tt-interest": "兴趣定向 “Interest — Kitchen & Dining” 花费 $86.00、307 次点击、0 笔订单。",
    "anm-acos-pmax": "ACOS 38.5%，高于 30% 目标；PMax 素材组学习期内属预期波动。"
  };
  snapshot.anomalies = snapshot.anomalies.map((item) => ({
    ...item,
    evidence: anomalyText[item.anomaly_id] || item.evidence
  }));

  const adjustmentText = {
    "adj-neg-lunchbox-kids": {
      title: "把 “lunch box kids” 加为精准否定关键词",
      current_value: "广泛匹配词，投放中",
      proposed_value: "在 SP Manual — Lunchbox Keywords 加精准否定",
      reason: "该搜索词只烧钱不出单，而同组词的转化率有 14-16%。",
      evidence: [
        "最近 14 天花费 $142.00、86 次点击、0 笔订单。",
        "同组词 “kids bento box”、“silicone lunch box” 转化率分别为 18.9% 和 16.7%。",
        "搜索词报告显示点击大多落在通用卡通饭盒结果页，与产品不匹配。"
      ],
      expected_impact: "每周约省 $70，预计不损失任何收入；广告活动 ACOS 下降 4-5 个百分点。"
    },
    "adj-bid-down-lunchbox": {
      title: "SP Manual — Lunchbox Keywords 整体降价 15%",
      current_value: "平均 CPC 出价 $1.35",
      proposed_value: "平均 CPC 出价 $1.15（−15%）",
      reason: "ACOS 已连续 7 天超过 25% 目标，问题出在 CPC 上涨而不是转化率。",
      evidence: [
        "近 7 天 ACOS 33.9%，目标为 25%。",
        "转化率稳定在约 16%；平均 CPC 两周内从 $1.18 涨到 $1.35。",
        "出价模拟器显示降到 $1.10 时首位展示份额仍在 60% 以上。"
      ],
      expected_impact: "ACOS 预计回落到 27-28%，订单量基本不变；每周约省 $32。"
    },
    "adj-budget-shift-tt": {
      title: "把 $10/天预算从 Google 品牌搜索挪到 TikTok Spark Ads",
      current_value: "Google 品牌 $20/天（实际只花约 $9）· TikTok $30/天（顶满）",
      proposed_value: "Google 品牌 $10/天 · TikTok $40/天",
      reason: "TikTok Spark Ads 每天下午预算就花光且 ROAS 3.9，而 Google 品牌搜索一半预算花不出去。",
      evidence: [
        "TikTok 最近 7 天有 6 天在下午 2 点前花光预算，ROAS 3.9。",
        "Google 品牌搜索 $20 日预算只能花出约 $9，品牌词流量就这么多。",
        "Spark 视频互动还在上升：评论和收藏周环比增长 22%。"
      ],
      expected_impact: "每天约多出 $10 的有效花费，ROAS 预计 3.5-4.0；品牌词覆盖不受影响。",
      note: "已批准。执行后连续观察 3 天 ROAS。"
    },
    "adj-creative-refresh-meta": {
      title: "用合规 UGC 素材替换被拒的 Meta 视频",
      current_value: "Before/After Reel v3（已被拒）",
      proposed_value: "新 UGC 装盒流程视频，不含前后对比",
      reason: "Meta 以个人健康广告规则中的前后对比条款拒登该素材，该测试单元现在无法花费。",
      evidence: [
        "拒登原因：“个人健康与形象” 政策，前后对比表现形式。",
        "被拒单元占测试预算 27%，其余素材会自动接量。",
        "申诉大概率无效：这条剪辑确实命中该政策。"
      ],
      expected_impact: "恢复第三个测试单元（约 $7/天），并消除账户质量分被标记的风险。",
      note: "等新一批 UGC 素材（预计 7 月 8 日）到位前先阻塞。"
    },
    "adj-pause-tt-interest": {
      title: "暂停 TikTok 厨房兴趣定向广告组",
      current_value: "广告组投放中，$12/天",
      proposed_value: "广告组已暂停",
      reason: "该兴趣广告组花了 $86、307 次点击、0 笔订单，流量质量与产品不匹配。",
      evidence: [
        "6 月 19 日以来花费 $86.00、307 次点击、0 笔订单。",
        "点击主要来自泛娱乐版位，没有购物意图。",
        "同一产品的 Spark Ads 转化率有 5%，预算应该放在那里。"
      ],
      expected_impact: "立即止住每天约 $12 的无效花费。",
      note: "同意，暂停。"
    },
    "adj-bid-up-lunchbox-auto": {
      title: "SP Auto — Silicone Bento Lunchbox 出价上调 10%",
      current_value: "平均 CPC 出价 $0.95",
      proposed_value: "平均 CPC 出价 $1.05（+10%）",
      reason: "该自动广告 ACOS 约 23%，低于 25% 目标，但夜间预算跑完后持续丢失展示份额。",
      evidence: [
        "最近 14 天 ROAS 4.3 / ACOS 23.3%，低于 25% 目标。",
        "晚 8 点到午夜平均因预算丢失 18% 展示份额。",
        "close-match 定向贡献 44 单中的 25 单；substitutes 在当前出价下仍有利润。"
      ],
      expected_impact: "close-match 展示量约 +15%，ACOS 预计仍低于目标。",
      note: "先给我加价 10% 后的预计日花费，再决定。"
    }
  };
  snapshot.adjustments = snapshot.adjustments.map((item) => {
    const text = adjustmentText[item.adjustment_id];
    if (!text) return item;
    const next = { ...item, ...text };
    if (item.decision && text.note) next.decision = { ...item.decision, note: text.note };
    if (item.execution) {
      next.execution = { ...item.execution, detail: "批准后由 Agent 通过 TikTok Ads API 暂停；当天花费即停止。" };
    }
    return next;
  });

  const syncText = {
    "sync-amazon-0702": "已导入 Amazon Ads 报告：4 个广告活动、14 天数据、12 个搜索词。",
    "sync-meta-0702": "已导入 Meta Ads 洞察：2 个广告活动、14 天数据、5 条素材/受众。",
    "sync-tiktok-0702": "已导入 TikTok Ads 报告：2 个广告活动、14 天数据。",
    "sync-google-0702": "已导入 Google Ads 报告：2 个广告活动、14 天数据、3 个素材组/搜索词。",
    "sync-checks-0702": "异常检查完成：7 条异常（2 条严重），起草了 1 张调整卡草稿。",
    "sync-exec-0626": "调整 #5 已执行：暂停 TikTok 兴趣定向广告组。"
  };
  snapshot.sync_log = snapshot.sync_log.map((item) => ({
    ...item,
    message: syncText[item.sync_id] || item.message
  }));

  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "Meta 拒登了 “Before/After Reel v3”，创意测试目前只剩 3 个单元中的 2 个在跑。",
    detail: "演示提醒，未读取任何真实平台数据。"
  }));
  return snapshot;
}
