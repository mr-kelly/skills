// Pure domain logic for kelly-ads. round1/round2/totalsForDays/trendFor/
// resolveAcosTarget/recomputeDerived are ported verbatim (same variable
// names, same order of operations, only TS types stripped) from the retired
// lib/common.ts. detectAnomalies/skeletonAdjustment are ported verbatim from
// the retired scripts/run_checks.ts. operationFor is ported verbatim from
// the retired scripts/execute_decisions.ts. statusForVerdict is ported
// verbatim from the retired lib/data-provider/local-file-provider.ts's
// applyDecision() VERDICT_STATUS map.
//
// normalize*/buildSnapshot/buildConfigSummary are new: they turn Busabase
// platforms/campaigns/anomalies/adjustments/sync_log/settings rows (already
// snake_cased by the provider) into the AdsSnapshot/ConfigSummary shapes
// documented in references/ads-schema.md. Busabase-only mode has no
// server-side env-var readiness check reachable from the browser, so the
// old secret_envs/secrets_ready fields on config_summary.platforms are
// dropped — the platform roster now only carries display-safe fields.

export const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// applyDecision(): VERDICT_STATUS. "note" never changes status.
export function statusForVerdict(verdict, currentStatus = "needs_review") {
  if (verdict === "approve") return "approved";
  if (verdict === "request_changes") return "changes_requested";
  if (verdict === "block") return "blocked";
  return currentStatus;
}

// ---- Ported verbatim from the retired lib/common.ts ----

export function round2(value = 0) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function round1(value = 0) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function totalsForDays(campaign = {}, days = 0) {
  const daily = Array.isArray(campaign.daily) ? [...campaign.daily].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const slice = days > 0 ? daily.slice(-days) : daily;
  const totals = slice.reduce(
    (acc, day) => {
      acc.spend += Number(day.spend || 0);
      acc.impressions += Number(day.impressions || 0);
      acc.clicks += Number(day.clicks || 0);
      acc.conversions += Number(day.conversions || 0);
      acc.revenue += Number(day.revenue || 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
  );
  return {
    spend: round2(totals.spend),
    impressions: totals.impressions,
    clicks: totals.clicks,
    conversions: totals.conversions,
    revenue: round2(totals.revenue),
    roas: totals.spend > 0 ? round2(totals.revenue / totals.spend) : 0,
    acos_pct: totals.revenue > 0 ? round1((totals.spend / totals.revenue) * 100) : 0,
    cpc: totals.clicks > 0 ? round2(totals.spend / totals.clicks) : 0,
  };
}

export function trendFor(campaign = {}) {
  const daily = Array.isArray(campaign.daily) ? [...campaign.daily].sort((a, b) => a.date.localeCompare(b.date)) : [];
  if (daily.length < 4) return "flat";
  const half = Math.floor(daily.length / 2);
  const roasOf = (slice) => {
    const spend = slice.reduce((sum, day) => sum + Number(day.spend || 0), 0);
    const revenue = slice.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
    return spend > 0 ? revenue / spend : 0;
  };
  const early = roasOf(daily.slice(0, half));
  const late = roasOf(daily.slice(half));
  if (early <= 0) return "flat";
  const delta = (late - early) / early;
  if (delta > 0.08) return "up";
  if (delta < -0.08) return "down";
  return "flat";
}

// Resolve the effective ACOS target for a campaign: per-product override (by
// SKU) beats per-platform override (by platform id) beats the global default.
function resolveAcosTarget(campaign = {}, config = {}, defaultAcos = 25) {
  const targets = config.targets || {};
  const perProduct = Array.isArray(targets.per_product) ? targets.per_product : [];
  if (campaign.sku) {
    const productOverride = perProduct.find((item) => item && item.sku === campaign.sku);
    const value = Number(productOverride?.acos_pct);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const perPlatform = targets.per_platform || {};
  const platformOverride = perPlatform[campaign.platform];
  const platformValue = Number(platformOverride?.acos_pct);
  if (Number.isFinite(platformValue) && platformValue > 0) return platformValue;
  return defaultAcos;
}

// Recompute campaign totals, platform rollups, and top-level metrics from the
// daily series. Shared by buildSnapshot() (Busabase reads) and the demo
// provider so the UI always reflects the same formula regardless of source.
export function recomputeDerived(snapshot = {}, config = {}) {
  const campaigns = Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [];
  const anomalies = Array.isArray(snapshot.anomalies) ? snapshot.anomalies : [];
  const adjustments = Array.isArray(snapshot.adjustments) ? snapshot.adjustments : [];
  const defaultAcos = Number(config.targets?.default_acos_pct || snapshot.targets?.acos_target_pct || 25);

  let latest = "";
  for (const campaign of campaigns) {
    campaign.totals_7d = totalsForDays(campaign, 7);
    campaign.trend = trendFor(campaign);
    if (!campaign.acos_target_pct) campaign.acos_target_pct = resolveAcosTarget(campaign, config, defaultAcos);
    for (const day of campaign.daily || []) {
      if (day.date > latest) latest = day.date;
    }
  }
  if (latest) {
    const dates = campaigns.flatMap((campaign) => (campaign.daily || []).map((day) => day.date));
    snapshot.range = { start: dates.reduce((min, d) => (min && min < d ? min : d), ""), end: latest };
  }

  const platforms = Array.isArray(snapshot.platforms) ? snapshot.platforms : [];
  for (const platform of platforms) {
    const own = campaigns.filter((campaign) => campaign.platform === platform.platform_id);
    const totals = own.reduce(
      (acc, campaign) => {
        const all = totalsForDays(campaign, 0);
        acc.spend += all.spend;
        acc.revenue += all.revenue;
        acc.conversions += all.conversions;
        return acc;
      },
      { spend: 0, revenue: 0, conversions: 0 },
    );
    platform.campaign_count = own.length;
    platform.spend_14d = round2(totals.spend);
    platform.revenue_14d = round2(totals.revenue);
    platform.conversions_14d = totals.conversions;
    platform.roas = totals.spend > 0 ? round2(totals.revenue / totals.spend) : 0;
    platform.acos_pct = totals.revenue > 0 ? round1((totals.spend / totals.revenue) * 100) : 0;
  }

  const month = latest ? latest.slice(0, 7) : "";
  const inMonth = (day) => month && day.date.startsWith(month);
  const all = campaigns.reduce(
    (acc, campaign) => {
      for (const day of campaign.daily || []) {
        acc.spend += Number(day.spend || 0);
        acc.revenue += Number(day.revenue || 0);
        acc.conversions += Number(day.conversions || 0);
        if (inMonth(day)) {
          acc.spendMtd += Number(day.spend || 0);
          acc.revenueMtd += Number(day.revenue || 0);
        }
      }
      return acc;
    },
    { spend: 0, revenue: 0, conversions: 0, spendMtd: 0, revenueMtd: 0 },
  );

  const budgetRiskPct = Number(config.thresholds?.budget_risk_pct || 85);
  snapshot.metrics = {
    ...(snapshot.metrics || {}),
    spend_mtd: round2(all.spendMtd),
    revenue_mtd: round2(all.revenueMtd),
    spend_14d: round2(all.spend),
    revenue_14d: round2(all.revenue),
    blended_roas: all.spend > 0 ? round2(all.revenue / all.spend) : 0,
    blended_acos_pct: all.revenue > 0 ? round1((all.spend / all.revenue) * 100) : 0,
    acos_target_pct: defaultAcos,
    conversions_14d: all.conversions,
    campaigns_total: campaigns.length,
    campaigns_active: campaigns.filter((campaign) => campaign.status === "active").length,
    anomalies_open: anomalies.filter((anomaly) => anomaly.state === "open").length,
    anomalies_critical: anomalies.filter((anomaly) => anomaly.state === "open" && anomaly.severity === "critical")
      .length,
    adjustments_needing_review: adjustments.filter((item) => item.status === "needs_review").length,
    budget_at_risk_today: campaigns.filter(
      (campaign) => campaign.status === "active" && Number(campaign.budget_spent_today_pct || 0) >= budgetRiskPct,
    ).length,
  };
  return snapshot;
}

// ---- Ported verbatim from the retired scripts/run_checks.ts ----

function sortedDaily(campaign) {
  return [...(campaign.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
}

export function detectAnomalies(snapshot = {}, thresholds = {}, defaultAcos = 25) {
  const found = [];
  const breachDays = Number(thresholds.acos_breach_days || 3);
  const budgetPct = Number(thresholds.budget_exhausted_pct || 100);
  const spendFloor = Number(thresholds.zero_conversion_spend_floor || 50);
  const cpcSpikePct = Number(thresholds.cpc_spike_pct || 40);
  const cpcTrailingDays = Number(thresholds.cpc_trailing_days || 14);

  for (const campaign of snapshot.campaigns || []) {
    const daily = sortedDaily(campaign);
    const target = Number(campaign.acos_target_pct || defaultAcos);

    // 1) ACOS above target for N consecutive days (days with spend only).
    if (campaign.status === "active" && daily.length >= breachDays && target > 0) {
      const recent = daily.slice(-breachDays);
      const breached = recent.every((day) => {
        const spend = Number(day.spend || 0);
        const revenue = Number(day.revenue || 0);
        if (spend <= 0) return false;
        return revenue <= 0 || (spend / revenue) * 100 > target;
      });
      if (breached) {
        const totals = totalsForDays(campaign, 7);
        found.push({
          anomaly_id: `anm-acos_breach-${campaign.campaign_id}`,
          type: "acos_breach",
          severity: totals.acos_pct > target * 1.5 || totals.revenue === 0 ? "critical" : "warning",
          campaign_id: campaign.campaign_id,
          platform: campaign.platform,
          target_id: "",
          evidence: `ACOS ${totals.acos_pct.toFixed(1)}% vs ${target.toFixed(0)}% target for ${breachDays}+ consecutive days.`,
        });
      }
    }

    // 2) Daily budget exhausted before day end.
    if (
      campaign.status === "active" &&
      Number(campaign.daily_budget || 0) > 0 &&
      Number(campaign.budget_spent_today_pct || 0) >= budgetPct
    ) {
      found.push({
        anomaly_id: `anm-budget_exhausted-${campaign.campaign_id}`,
        type: "budget_exhausted",
        severity: "warning",
        campaign_id: campaign.campaign_id,
        platform: campaign.platform,
        target_id: "",
        evidence: `Daily budget ${snapshot.currency || "USD"} ${round2(campaign.daily_budget).toFixed(2)} already ${Number(campaign.budget_spent_today_pct)}% spent before day end.`,
      });
    }

    // 3) High-spend zero-conversion targets (search terms / audiences / creatives).
    for (const term of campaign.targets || []) {
      if (term.state !== "enabled") continue;
      const spend = Number(term.spend_14d || 0);
      if (spend >= spendFloor && Number(term.conversions || 0) === 0) {
        found.push({
          anomaly_id: `anm-zero_conversion_spend-${campaign.campaign_id}-${term.target_id}`,
          type: "zero_conversion_spend",
          severity: spend >= spendFloor * 2 ? "critical" : "warning",
          campaign_id: campaign.campaign_id,
          platform: campaign.platform,
          target_id: term.target_id,
          evidence: `${snapshot.currency || "USD"} ${spend.toFixed(2)} on '${term.text}' with ${Number(term.clicks || 0)} clicks and 0 orders in 14 days.`,
        });
      }
    }

    // 4) CPC spike vs trailing mean.
    if (campaign.status === "active" && daily.length >= 4) {
      const window = daily.slice(-cpcTrailingDays);
      const last = window[window.length - 1];
      const lastCpc = Number(last.clicks) > 0 ? Number(last.spend) / Number(last.clicks) : 0;
      const trailing = window.slice(0, -1).filter((day) => Number(day.clicks) > 0);
      if (lastCpc > 0 && trailing.length >= 3) {
        const mean = trailing.reduce((sum, day) => sum + Number(day.spend) / Number(day.clicks), 0) / trailing.length;
        const deltaPct = mean > 0 ? ((lastCpc - mean) / mean) * 100 : 0;
        if (deltaPct >= cpcSpikePct) {
          found.push({
            anomaly_id: `anm-cpc_spike-${campaign.campaign_id}`,
            type: "cpc_spike",
            severity: "warning",
            campaign_id: campaign.campaign_id,
            platform: campaign.platform,
            target_id: "",
            evidence: `CPC ${round2(lastCpc).toFixed(2)} on ${last.date} vs ${round2(mean).toFixed(2)} trailing mean (+${round1(deltaPct)}%).`,
          });
        }
      }
    }

    // 5) Campaign or creative rejected / paused by the platform.
    if (campaign.status === "rejected") {
      found.push({
        anomaly_id: `anm-rejected-${campaign.campaign_id}`,
        type: "rejected",
        severity: "critical",
        campaign_id: campaign.campaign_id,
        platform: campaign.platform,
        target_id: "",
        evidence: `Campaign '${campaign.name}' is rejected by the platform.`,
      });
    }
    for (const term of campaign.targets || []) {
      if (term.state === "rejected") {
        found.push({
          anomaly_id: `anm-rejected-${campaign.campaign_id}-${term.target_id}`,
          type: "rejected",
          severity: "critical",
          campaign_id: campaign.campaign_id,
          platform: campaign.platform,
          target_id: term.target_id,
          evidence: `Ad '${term.text}' was rejected by the platform.`,
        });
      }
    }
  }
  return found;
}

export function skeletonAdjustment(snapshot, anomaly, ref) {
  const campaign = (snapshot.campaigns || []).find((item) => item.campaign_id === anomaly.campaign_id) || {};
  const term = (campaign.targets || []).find((item) => item.target_id === anomaly.target_id) || null;
  const base = {
    ref,
    status: "needs_review",
    campaign_id: anomaly.campaign_id,
    platform: anomaly.platform,
    reason: anomaly.evidence,
    evidence: [anomaly.evidence],
    expected_impact: "",
    anomaly_id: anomaly.anomaly_id,
    note: "",
    created_at: new Date().toISOString(),
    decision: null,
    execution: null,
  };
  if (anomaly.type === "zero_conversion_spend" && term && term.type === "search_term") {
    return {
      ...base,
      adjustment_id: `adj-neg-${anomaly.campaign_id}-${anomaly.target_id}`,
      type: "negative_keyword",
      title: `Add '${term.text}' as a negative keyword`,
      target: { kind: "term", id: term.target_id, text: term.text },
      current_value: `${term.match_type || "broad"} match, enabled`,
      proposed_value: `Negative exact on ${campaign.name || anomaly.campaign_id}`,
    };
  }
  if (anomaly.type === "zero_conversion_spend") {
    return {
      ...base,
      adjustment_id: `adj-pause-${anomaly.campaign_id}-${anomaly.target_id}`,
      type: "pause_target",
      title: `Pause '${term?.text || anomaly.target_id}'`,
      target: { kind: "term", id: anomaly.target_id, text: term?.text || "" },
      current_value: "Enabled",
      proposed_value: "Paused",
    };
  }
  if (anomaly.type === "rejected") {
    return {
      ...base,
      adjustment_id: `adj-refresh-${anomaly.campaign_id}${anomaly.target_id ? `-${anomaly.target_id}` : ""}`,
      type: "creative_refresh",
      title: `Replace rejected creative on ${campaign.name || anomaly.campaign_id}`,
      target: {
        kind: "creative",
        id: anomaly.target_id || anomaly.campaign_id,
        text: term?.text || campaign.name || "",
      },
      current_value: term?.text ? `${term.text} (rejected)` : "Rejected creative",
      proposed_value: "New compliant creative (agent to propose)",
    };
  }
  // acos_breach fallback (only drafted when critical).
  return {
    ...base,
    adjustment_id: `adj-bid-down-${anomaly.campaign_id}`,
    type: "bid_down",
    title: `Lower bids on ${campaign.name || anomaly.campaign_id}`,
    target: { kind: "campaign", id: anomaly.campaign_id, text: "all enabled targets" },
    current_value: "Current bids",
    proposed_value: "Lower bids (agent to size the cut)",
  };
}

// ---- Ported verbatim from the retired scripts/execute_decisions.ts ----

export function operationFor(adjustment) {
  const target = adjustment.target || {};
  switch (adjustment.type) {
    case "negative_keyword":
      return {
        operation: "add_negative_keyword",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          term: target.text || target.id || "",
          match: "negative_exact",
        },
        note: `Add '${target.text || target.id || "the term"}' as a negative exact keyword on ${adjustment.campaign_id}.`,
      };
    case "bid_down":
    case "bid_up":
      return {
        operation: "set_bid",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          scope: target.text || target.id || "all enabled targets",
          current: adjustment.current_value || "",
          new: adjustment.proposed_value || "",
        },
        note: `Set bids on ${adjustment.campaign_id}: ${adjustment.current_value || "current"} → ${adjustment.proposed_value || "proposed"}.`,
      };
    case "pause_target":
      return {
        operation: "pause_target",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          target_id: target.id || "",
          text: target.text || "",
        },
        note: `Pause '${target.text || target.id || "the target"}' on ${adjustment.campaign_id} and confirm spend stops.`,
      };
    case "budget_shift":
      return {
        operation: "shift_budget",
        target: {
          platform: adjustment.platform,
          from_campaign_id: target.id || "",
          to_campaign_id: adjustment.campaign_id,
          current: adjustment.current_value || "",
          new: adjustment.proposed_value || "",
        },
        note: `Shift daily budget: ${adjustment.current_value || "current"} → ${adjustment.proposed_value || "proposed"}.`,
      };
    case "creative_refresh":
      return {
        operation: "refresh_creative",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          creative_id: target.id || "",
          text: target.text || "",
        },
        note: `Replace creative '${target.text || target.id || ""}' on ${adjustment.campaign_id} with the approved new asset.`,
      };
    default:
      return {
        operation: adjustment.type || "unknown",
        target,
        note: "Unrecognized adjustment type; execute manually.",
      };
  }
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizePlatform({
  platform_id = "",
  name = "",
  account_id = "",
  status = "ok",
  currency = "USD",
  last_sync_at = "",
} = {}) {
  return {
    platform_id,
    name: name || platform_id,
    account_id,
    status,
    currency,
    last_sync_at,
    campaign_count: 0,
    spend_14d: 0,
    revenue_14d: 0,
    conversions_14d: 0,
    roas: 0,
    acos_pct: 0,
  };
}

export function normalizeCampaign({
  campaign_id = "",
  platform = "",
  name = "",
  product = "",
  sku = "",
  status = "active",
  daily_budget = 0,
  budget_spent_today_pct = 0,
  acos_target_pct = 0,
  currency = "USD",
  daily = "",
  targets = "",
  last_sync_at = "",
} = {}) {
  return {
    campaign_id,
    platform,
    name: name || campaign_id,
    product,
    sku,
    status,
    daily_budget: Number(daily_budget) || 0,
    budget_spent_today_pct: Number(budget_spent_today_pct) || 0,
    acos_target_pct: Number(acos_target_pct) || 0,
    currency,
    daily: parseJsonValue(daily, []) || [],
    targets: parseJsonValue(targets, []) || [],
    last_sync_at,
  };
}

export function normalizeAnomaly({
  anomaly_id = "",
  type = "acos_breach",
  severity = "warning",
  state = "open",
  campaign_id = "",
  platform = "",
  target_id = "",
  evidence = "",
  detected_at = "",
  first_seen_at = "",
  adjustment_id = "",
} = {}) {
  return {
    anomaly_id,
    type,
    severity,
    state,
    campaign_id,
    platform,
    target_id,
    evidence,
    detected_at,
    first_seen_at,
    adjustment_id,
  };
}

export function normalizeAdjustment({
  adjustment_id = "",
  ref = 0,
  type = "bid_down",
  title = "",
  status = "needs_review",
  campaign_id = "",
  platform = "",
  reason = "",
  evidence = "",
  target = "",
  current_value = "",
  proposed_value = "",
  expected_impact = "",
  anomaly_id = "",
  note = "",
  created_at = "",
  decision_verdict = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    adjustment_id,
    ref: Number(ref) || 0,
    type,
    title: title || "(untitled)",
    status,
    campaign_id,
    platform,
    reason,
    evidence: parseJsonValue(evidence, []) || [],
    target: parseJsonValue(target, {}) || {},
    current_value,
    proposed_value,
    expected_impact,
    anomaly_id,
    note,
    created_at,
    decision: decision_verdict ? { verdict: decision_verdict, note: decision_note, decided_at } : null,
    execution: execution_status
      ? {
          status: execution_status,
          operation: execution_operation,
          target: parseJsonValue(execution_target, {}) || {},
          detail: execution_detail,
          executed_at,
        }
      : null,
  };
}

export function normalizeSyncLogEntry({
  sync_id = "",
  at = "",
  platform = "",
  kind = "",
  message = "",
  rows = 0,
} = {}) {
  return { sync_id, at, platform, kind, message, rows: Number(rows) || 0 };
}

/**
 * @param {{
 *   platforms?: Array<Record<string, any>>,
 *   campaigns?: Array<Record<string, any>>,
 *   anomalies?: Array<Record<string, any>>,
 *   adjustments?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: number,
 * }} [args]
 */
export function buildSnapshot({
  platforms = [],
  campaigns = [],
  anomalies = [],
  adjustments = [],
  sync_log = [],
  settings = {},
  now = Date.now(),
} = {}) {
  const config = configFromSettings(settings);
  const normalizedPlatforms = platforms.map(normalizePlatform);
  const normalizedCampaigns = campaigns.map(normalizeCampaign);
  const normalizedAnomalies = anomalies.map(normalizeAnomaly);
  const normalizedAdjustments = adjustments.map(normalizeAdjustment);
  const normalizedSyncLog = sync_log
    .map(normalizeSyncLogEntry)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 50);

  const snapshot = {
    schema_version: "1",
    generated_at: new Date(now).toISOString(),
    source: "kelly-ads",
    currency: settings.currency || normalizedPlatforms[0]?.currency || "USD",
    range: { start: "", end: "" },
    targets: { acos_target_pct: config.targets.default_acos_pct, roas_target: config.targets.default_roas },
    metrics: { spend_last_month: round2(settings.spend_last_month || 0) },
    platforms: normalizedPlatforms,
    campaigns: normalizedCampaigns,
    anomalies: normalizedAnomalies,
    adjustments: normalizedAdjustments,
    sync_log: normalizedSyncLog,
    warnings: normalizedCampaigns.length
      ? []
      : [
          {
            id: "no-snapshot",
            severity: "info",
            message: "No ads snapshot yet. Configure platforms, then ingest platform reports.",
          },
        ],
  };
  recomputeDerived(snapshot, config);
  return snapshot;
}

// Shared by buildSnapshot() and detectAnomalies() callers: turns a flat
// Busabase settings row into the { targets, thresholds } config shape the
// ported lib/common.ts / scripts/run_checks.ts functions expect.
export function configFromSettings(settings = {}) {
  return {
    targets: {
      default_acos_pct: Number(settings.default_acos_pct || 25),
      default_roas: Number(settings.default_roas || 4),
      per_product: parseJsonValue(settings.per_product_targets, []) || [],
      per_platform: parseJsonValue(settings.per_platform_targets, {}) || {},
    },
    thresholds: {
      acos_breach_days: Number(settings.acos_breach_days || 3),
      budget_exhausted_pct: Number(settings.budget_exhausted_pct || 100),
      budget_risk_pct: Number(settings.budget_risk_pct || 85),
      zero_conversion_spend_floor: Number(settings.zero_conversion_spend_floor || 50),
      cpc_spike_pct: Number(settings.cpc_spike_pct || 40),
      cpc_trailing_days: Number(settings.cpc_trailing_days || 14),
    },
  };
}

// Sanitized config summary for #/settings — thresholds and targets plus the
// platform roster, derived from the same live Busabase rows the overview
// uses (no separate config store in the Busabase-only shape, and no
// secret-readiness booleans since the browser cannot check env vars).
/**
 * @param {{ platforms?: Array<Record<string, any>>, settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ platforms = [], settings = {} } = {}) {
  const config = configFromSettings(settings);
  return {
    config_path: "busabase",
    is_example: false,
    currency: settings.currency || "USD",
    targets: config.targets,
    thresholds: config.thresholds,
    platforms: platforms.map((platform) => ({
      platform_id: platform.platform_id,
      name: platform.name || platform.platform_id,
      account_id: platform.account_id || "",
    })),
  };
}
