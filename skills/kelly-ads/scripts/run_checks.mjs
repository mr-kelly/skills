#!/usr/bin/env node
// Deterministic anomaly detection over app/.data/ads_snapshot.json using the
// thresholds from private config. Upserts anomalies with stable ids,
// auto-resolves anomalies whose condition cleared, and drafts skeleton
// adjustment cards for new critical anomalies (the agent enriches reasoning
// and evidence via a follow-up ingest). Idempotent: re-running without data
// changes produces the same anomalies and no duplicate cards.
//
// Usage: node scripts/run_checks.mjs
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  acquireLock,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  pushSyncLog,
  readConfig,
  readSnapshot,
  recomputeDerived,
  releaseLock,
  round1,
  round2,
  totalsForDays,
  writeJson
} from "../app/server/store.mjs";

const OWNER = "kelly-ads-checks";

function sortedDaily(campaign) {
  return [...(campaign.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
}

function detectAnomalies(snapshot, thresholds, defaultAcos) {
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
          evidence: `ACOS ${totals.acos_pct.toFixed(1)}% vs ${target.toFixed(0)}% target for ${breachDays}+ consecutive days.`
        });
      }
    }

    // 2) Daily budget exhausted before day end.
    if (campaign.status === "active" && Number(campaign.daily_budget || 0) > 0 && Number(campaign.budget_spent_today_pct || 0) >= budgetPct) {
      found.push({
        anomaly_id: `anm-budget_exhausted-${campaign.campaign_id}`,
        type: "budget_exhausted",
        severity: "warning",
        campaign_id: campaign.campaign_id,
        platform: campaign.platform,
        target_id: "",
        evidence: `Daily budget ${snapshot.currency || "USD"} ${round2(campaign.daily_budget).toFixed(2)} already ${Number(campaign.budget_spent_today_pct)}% spent before day end.`
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
          evidence: `${snapshot.currency || "USD"} ${spend.toFixed(2)} on '${term.text}' with ${Number(term.clicks || 0)} clicks and 0 orders in 14 days.`
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
            evidence: `CPC ${round2(lastCpc).toFixed(2)} on ${last.date} vs ${round2(mean).toFixed(2)} trailing mean (+${round1(deltaPct)}%).`
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
        evidence: `Campaign '${campaign.name}' is rejected by the platform.`
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
          evidence: `Ad '${term.text}' was rejected by the platform.`
        });
      }
    }
  }
  return found;
}

function skeletonAdjustment(snapshot, anomaly, ref) {
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
    execution: null
  };
  if (anomaly.type === "zero_conversion_spend" && term && term.type === "search_term") {
    return {
      ...base,
      adjustment_id: `adj-neg-${anomaly.campaign_id}-${anomaly.target_id}`,
      type: "negative_keyword",
      title: `Add '${term.text}' as a negative keyword`,
      target: { kind: "term", id: term.target_id, text: term.text },
      current_value: `${term.match_type || "broad"} match, enabled`,
      proposed_value: `Negative exact on ${campaign.name || anomaly.campaign_id}`
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
      proposed_value: "Paused"
    };
  }
  if (anomaly.type === "rejected") {
    return {
      ...base,
      adjustment_id: `adj-refresh-${anomaly.campaign_id}${anomaly.target_id ? `-${anomaly.target_id}` : ""}`,
      type: "creative_refresh",
      title: `Replace rejected creative on ${campaign.name || anomaly.campaign_id}`,
      target: { kind: "creative", id: anomaly.target_id || anomaly.campaign_id, text: term?.text || campaign.name || "" },
      current_value: term?.text ? `${term.text} (rejected)` : "Rejected creative",
      proposed_value: "New compliant creative (agent to propose)"
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
    proposed_value: "Lower bids (agent to size the cut)"
  };
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  const thresholds = config.thresholds || {};
  const defaultAcos = Number(config.targets?.default_acos_pct || 25);

  try {
    await acquireLock(OWNER, "Running anomaly checks");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const snapshot = await readSnapshot();
    const now = new Date().toISOString();
    snapshot.anomalies = Array.isArray(snapshot.anomalies) ? snapshot.anomalies : [];
    snapshot.adjustments = Array.isArray(snapshot.adjustments) ? snapshot.adjustments : [];

    const found = detectAnomalies(snapshot, thresholds, defaultAcos);
    const foundIds = new Set(found.map((item) => item.anomaly_id));
    const existingById = new Map(snapshot.anomalies.map((item) => [item.anomaly_id, item]));

    let created = 0;
    let updated = 0;
    let resolved = 0;
    let drafted = 0;

    for (const item of found) {
      const existing = existingById.get(item.anomaly_id);
      if (existing) {
        existing.evidence = item.evidence;
        existing.severity = item.severity;
        existing.detected_at = now;
        if (existing.state === "resolved") existing.state = "open";
        updated += 1;
      } else {
        snapshot.anomalies.push({
          ...item,
          state: "open",
          detected_at: now,
          first_seen_at: now,
          adjustment_id: ""
        });
        created += 1;
      }
    }

    for (const anomaly of snapshot.anomalies) {
      if (!foundIds.has(anomaly.anomaly_id) && ["open", "actioned"].includes(anomaly.state)) {
        anomaly.state = "resolved";
        anomaly.detected_at = now;
        resolved += 1;
      }
    }

    let nextRef = snapshot.adjustments.reduce((max, item) => Math.max(max, Number(item.ref || 0)), 0) + 1;
    for (const anomaly of snapshot.anomalies) {
      if (anomaly.state !== "open" || anomaly.severity !== "critical" || anomaly.adjustment_id) continue;
      const card = skeletonAdjustment(snapshot, anomaly, nextRef);
      if (snapshot.adjustments.some((item) => item.adjustment_id === card.adjustment_id)) {
        anomaly.adjustment_id = card.adjustment_id;
        continue;
      }
      snapshot.adjustments.push(card);
      anomaly.adjustment_id = card.adjustment_id;
      nextRef += 1;
      drafted += 1;
    }

    const criticalOpen = snapshot.anomalies.filter((item) => item.state === "open" && item.severity === "critical").length;
    snapshot.generated_at = now;
    snapshot.source = "kelly-ads";
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
    pushSyncLog(snapshot, {
      sync_id: `sync-checks-${now.slice(0, 10)}`,
      at: now,
      platform: "",
      kind: "checks",
      message: `Anomaly checks completed: ${found.length} anomaly(ies) active (${criticalOpen} critical), ${created} new, ${resolved} auto-resolved, ${drafted} skeleton adjustment(s) drafted.`,
      rows: found.length
    });
    recomputeDerived(snapshot, config);
    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Checks done: ${found.length} active anomaly(ies) (${created} new, ${updated} updated, ${resolved} auto-resolved), ${drafted} skeleton adjustment card(s) drafted.`);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
