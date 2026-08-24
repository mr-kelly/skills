// Pure domain logic for kelly-family-office, ported verbatim from the retired
// app/server/{portfolio.ts,insights.ts}. Given entities, accounts, holdings,
// fx rates, and a base currency, buildSnapshot converts every holding to the
// base currency and computes the consolidated totals and the three
// aggregation dimensions (by_entity / by_asset_class / by_institution).
// computeInsights derives a small set of neutral, factual observations from
// an already-built snapshot. Both are read-only: nothing here moves money.

const SEVERITY_RANK = { high: 3, watch: 2, info: 1 };

const DEFAULT_TARGET_ALLOCATION = {
  EQUITY: 45,
  BOND: 20,
  REAL_ESTATE: 15,
  PRIVATE_EQUITY: 8,
  CRYPTO: 5,
  CASH: 5,
  ALTERNATIVE: 2,
};

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function fxRate(fxRates, currency) {
  const rate = fxRates?.[currency];
  return typeof rate === "number" && rate > 0 ? rate : 1;
}

export function normalizeHoldings(holdings = [], accounts = [], fxRates = {}) {
  const accountById = new Map(accounts.map((account) => [account.account_id, account]));
  const warnings = [];
  const normalized = holdings.map((holding) => {
    const account = accountById.get(holding.account_id) || {};
    const currency = holding.currency || account.currency || "USD";
    const entity_id = holding.entity_id || account.entity_id || "";
    const configuredRate = fxRates?.[currency];
    const rate = fxRate(fxRates, currency);
    if (!(typeof configuredRate === "number" && configuredRate > 0)) {
      warnings.push({
        id: `fx-missing-${holding.holding_id || currency}`,
        severity: "warning",
        entity_id,
        message: `No FX rate configured for ${currency}; valued ${holding.holding_id || "holding"} at a 1:1 fallback rate.`,
        detail: "Add this currency to fx_rates so base-currency totals are accurate.",
      });
    }
    const market_value = round2(holding.market_value);
    const cost_basis = round2(holding.cost_basis);
    const market_value_base = round2(market_value * rate);
    const cost_basis_base = round2(cost_basis * rate);
    return {
      ...holding,
      entity_id,
      currency,
      quantity: Number(holding.quantity) || 0,
      market_value,
      cost_basis,
      market_value_base,
      cost_basis_base,
      unrealized_pnl_base: round2(market_value_base - cost_basis_base),
    };
  });
  return { holdings: normalized, warnings };
}

export function buildSnapshot({
  snapshot_id = "",
  generated_at = "",
  base_currency = "USD",
  fx_rates = { USD: 1 },
  entities = [],
  accounts = [],
  holdings = [],
  source = "kelly-family-office",
  warnings = [],
} = {}) {
  const { holdings: normalized, warnings: fxWarnings } = normalizeHoldings(holdings, accounts, fx_rates);

  const aum_base = round2(normalized.reduce((sum, h) => sum + h.market_value_base, 0));
  const cost_basis_base = round2(normalized.reduce((sum, h) => sum + h.cost_basis_base, 0));
  const unrealized_pnl_base = round2(aum_base - cost_basis_base);
  const unrealized_pnl_pct = cost_basis_base ? round2((unrealized_pnl_base / cost_basis_base) * 100) : 0;

  const weight = (value) => (aum_base ? round2((value / aum_base) * 100) : 0);

  const entityMeta = new Map(entities.map((entity) => [entity.entity_id, entity]));
  const accountMeta = new Map(accounts.map((account) => [account.account_id, account]));

  const entityAgg = new Map();
  const assetAgg = new Map();
  const instAgg = new Map();

  for (const h of normalized) {
    const entity = entityAgg.get(h.entity_id) || { aum_base: 0, unrealized_pnl_base: 0 };
    entity.aum_base += h.market_value_base;
    entity.unrealized_pnl_base += h.unrealized_pnl_base;
    entityAgg.set(h.entity_id, entity);

    const asset = assetAgg.get(h.asset_class) || { aum_base: 0 };
    asset.aum_base += h.market_value_base;
    assetAgg.set(h.asset_class, asset);

    const institution = accountMeta.get(h.account_id)?.institution || "Unassigned";
    const inst = instAgg.get(institution) || { aum_base: 0 };
    inst.aum_base += h.market_value_base;
    instAgg.set(institution, inst);
  }

  const by_entity = [...entityAgg.entries()]
    .map(([entity_id, agg]) => ({
      entity_id,
      name: entityMeta.get(entity_id)?.name || entity_id,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
      unrealized_pnl_base: round2(agg.unrealized_pnl_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  const by_asset_class = [...assetAgg.entries()]
    .map(([asset_class, agg]) => ({
      asset_class,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  const by_institution = [...instAgg.entries()]
    .map(([institution, agg]) => ({
      institution,
      aum_base: round2(agg.aum_base),
      weight_pct: weight(agg.aum_base),
    }))
    .sort((a, b) => b.aum_base - a.aum_base);

  return {
    schema_version: "1",
    snapshot_id: snapshot_id || `fo-${Date.now()}`,
    generated_at: generated_at || new Date().toISOString(),
    source,
    base_currency,
    fx_rates,
    entities,
    accounts,
    holdings: normalized,
    totals: {
      aum_base,
      cost_basis_base,
      unrealized_pnl_base,
      unrealized_pnl_pct,
    },
    by_entity,
    by_asset_class,
    by_institution,
    warnings: [...warnings, ...fxWarnings],
  };
}

// Deterministic, rule-based, READ-ONLY portfolio observations. These are
// OBSERVATIONS ONLY — they are not investment advice, not recommendations,
// and not actions. No buy/sell/rebalance wording, nothing executable.
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
