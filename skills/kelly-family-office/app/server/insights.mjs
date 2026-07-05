// Deterministic, rule-based, READ-ONLY portfolio observations.
//
// computeInsights derives a small set of neutral, factual flags from an already
// consolidated snapshot (the same shape produced by buildSnapshot) plus an
// optional target-allocation map. These are OBSERVATIONS ONLY — they are not
// investment advice, not recommendations, and not actions. No buy/sell/rebalance
// wording, nothing executable. The module is pure (no fs, no I/O); the frontend
// renders the localized text from each insight's `code` + `params`.
//
// Each insight: { id, code, severity: "info"|"watch"|"high", category, params }.

const DEFAULT_TARGET_ALLOCATION = {
  EQUITY: 45,
  BOND: 20,
  REAL_ESTATE: 15,
  PRIVATE_EQUITY: 8,
  CRYPTO: 5,
  CASH: 5,
  ALTERNATIVE: 2,
};

const SEVERITY_RANK = { high: 3, watch: 2, info: 1 };

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function computeInsights(snapshot, targetAllocation) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const byAsset = Array.isArray(snapshot.by_asset_class) ? snapshot.by_asset_class : [];
  const byInstitution = Array.isArray(snapshot.by_institution) ? snapshot.by_institution : [];
  const byEntity = Array.isArray(snapshot.by_entity) ? snapshot.by_entity : [];
  const holdings = Array.isArray(snapshot.holdings) ? snapshot.holdings : [];
  const totals = snapshot.totals || {};
  const aumBase = Number(totals.aum_base) || 0;
  const baseCurrency = snapshot.base_currency || "USD";
  const target =
    targetAllocation && typeof targetAllocation === "object" ? targetAllocation : DEFAULT_TARGET_ALLOCATION;

  if (!holdings.length || aumBase <= 0) return [];

  const insights = [];

  // 1. asset_class_concentration — largest asset class weight (>=40 high, >=30 watch)
  const topAsset = [...byAsset].sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0))[0];
  if (topAsset) {
    const pct = round1(topAsset.weight_pct);
    if (pct >= 40 || pct >= 30) {
      insights.push({
        id: `asset_class_concentration:${topAsset.asset_class}`,
        code: "asset_class_concentration",
        severity: pct >= 40 ? "high" : "watch",
        category: "concentration",
        params: { asset_class: topAsset.asset_class, pct },
      });
    }
  }

  // 2. institution_concentration — largest institution weight (>=40 high, >=25 watch)
  const topInstitution = [...byInstitution].sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0))[0];
  if (topInstitution) {
    const pct = round1(topInstitution.weight_pct);
    if (pct >= 25) {
      insights.push({
        id: `institution_concentration:${topInstitution.institution}`,
        code: "institution_concentration",
        severity: pct >= 40 ? "high" : "watch",
        category: "institution",
        params: { institution: topInstitution.institution, pct },
      });
    }
  }

  // 3. entity_concentration — largest entity weight (>=50 watch)
  const topEntity = [...byEntity].sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0))[0];
  if (topEntity) {
    const pct = round1(topEntity.weight_pct);
    if (pct >= 50) {
      insights.push({
        id: `entity_concentration:${topEntity.entity_id}`,
        code: "entity_concentration",
        severity: "watch",
        category: "entity",
        params: { name: topEntity.name || topEntity.entity_id, pct },
      });
    }
  }

  // 4. allocation_drift — per asset class, |actual - target| >= 10pp (watch)
  const actualByClass = new Map(byAsset.map((row) => [row.asset_class, Number(row.weight_pct) || 0]));
  const driftClasses = new Set([...actualByClass.keys(), ...Object.keys(target)]);
  const drifts = [];
  for (const assetClass of driftClasses) {
    const actual = round1(actualByClass.get(assetClass) || 0);
    const targetPct = round1(Number(target[assetClass]) || 0);
    const delta = round1(actual - targetPct);
    if (Math.abs(delta) >= 10) {
      drifts.push({ asset_class: assetClass, actual, target: targetPct, delta });
    }
  }
  drifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const drift of drifts.slice(0, 3)) {
    insights.push({
      id: `allocation_drift:${drift.asset_class}`,
      code: "allocation_drift",
      severity: "watch",
      category: "drift",
      params: drift,
    });
  }

  // 5. currency_exposure — non-base currency share of AUM >= 25 (info)
  const byCurrency = new Map();
  for (const holding of holdings) {
    const currency = holding.currency || baseCurrency;
    byCurrency.set(currency, (byCurrency.get(currency) || 0) + (Number(holding.market_value_base) || 0));
  }
  const currencyRows = [...byCurrency.entries()]
    .filter(([currency]) => currency !== baseCurrency)
    .map(([currency, value]) => ({ currency, pct: round1((value / aumBase) * 100) }))
    .filter((row) => row.pct >= 25)
    .sort((a, b) => b.pct - a.pct);
  for (const row of currencyRows) {
    insights.push({
      id: `currency_exposure:${row.currency}`,
      code: "currency_exposure",
      severity: "info",
      category: "currency",
      params: row,
    });
  }

  // 6. cash_level — CASH weight >=15 watch (drag) OR <=2 info (thin buffer)
  const cashWeight = round1(actualByClass.get("CASH") || 0);
  if (cashWeight >= 15) {
    insights.push({
      id: "cash_level:high",
      code: "cash_level",
      severity: "watch",
      category: "cash",
      params: { pct: cashWeight },
    });
  } else if (cashWeight <= 2) {
    insights.push({
      id: "cash_level:low",
      code: "cash_level",
      severity: "info",
      category: "cash",
      params: { pct: cashWeight },
    });
  }

  const magnitude = (insight) => {
    const p = insight.params || {};
    return Math.abs(Number(p.pct ?? p.delta ?? 0)) || 0;
  };
  insights.sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    return rank !== 0 ? rank : magnitude(b) - magnitude(a);
  });

  return insights.slice(0, 6);
}
