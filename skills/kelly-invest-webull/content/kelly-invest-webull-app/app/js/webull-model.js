// Pure domain logic for kelly-invest-webull, ported verbatim from the retired
// lib/data-provider/webull.ts (credential resolution + raw Webull field
// mapping + snapshot assembly) and app/server/insights.ts (read-only
// portfolio observations). Same variable names, same order of operations,
// same rounding helpers as the originals — only TS type annotations were
// stripped and metadata (snapshot_id/generated_at/source/warnings) was
// parameterized so both the browser (assembleSnapshot/computeInsights) and
// the trusted skill-root sync script (mapAccount/mapPosition/
// resolveWebullCredentials) can share this one file.
//
// READ-ONLY BOUNDARY: nothing in this module places, modifies, or cancels
// orders, and nothing moves money. It only normalizes and aggregates
// account/balance/position data.

const ASSET_TYPE_MAP = {
  STOCK: "STOCK",
  EQUITY: "STOCK",
  ETF: "ETF",
  FUND: "ETF",
  OPTION: "OPTION",
  CRYPTO: "CRYPTO",
  CRYPTOCURRENCY: "CRYPTO",
};

const SEVERITY_ORDER = { high: 3, watch: 2, info: 1 };

export const DEFAULT_TARGET_ALLOCATION = { STOCK: 45, ETF: 35, CRYPTO: 10, CASH: 10 };

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Resolve Webull App Key / App Secret from config-referenced env var names.
 * Node-only (reads process.env); never called from the browser bundle.
 */
export function resolveWebullCredentials(config = {}) {
  const webull = config.webull || {};
  const appKeyEnv = webull.app_key_env || "KELLY_INVEST_WEBULL_APP_KEY";
  const appSecretEnv = webull.app_secret_env || "KELLY_INVEST_WEBULL_APP_SECRET";
  const env = typeof process !== "undefined" ? process.env : {};
  return {
    appKey: env[appKeyEnv] || "",
    appSecret: env[appSecretEnv] || "",
    region: webull.region || "us",
    baseUrl: webull.base_url || "https://us-openapi.webullbroker.com",
    allowlist: Array.isArray(webull.account_allowlist) ? webull.account_allowlist : [],
  };
}

/**
 * Normalize a Webull instrument/category label to our asset_type enum.
 */
export function normalizeAssetType(raw) {
  return ASSET_TYPE_MAP[String(raw || "").toUpperCase()] || "OTHER";
}

/**
 * Map a Webull position record (from get_account_positions) to our schema.
 * Field names below are the expected SDK shape; verify against live
 * responses, since the exact REST JSON is behind the SDK.
 */
export function mapPosition(raw = {}, accountId = "") {
  const quantity = Number(raw.quantity ?? raw.position ?? 0);
  const avg_cost = Number(raw.costPrice ?? raw.avgCost ?? 0);
  const last_price = Number(raw.lastPrice ?? raw.marketPrice ?? 0);
  const prev_close = Number(raw.prevClose ?? raw.lastPrice ?? last_price);
  const market_value = round2(raw.marketValue != null ? Number(raw.marketValue) : quantity * last_price);
  const cost_basis = round2(quantity * avg_cost);
  const unrealized_pnl = round2(
    raw.unrealizedProfitLoss != null ? Number(raw.unrealizedProfitLoss) : market_value - cost_basis,
  );
  const unrealized_pnl_pct = cost_basis ? round2((unrealized_pnl / cost_basis) * 100) : 0;
  const day_change = round2(quantity * (last_price - prev_close));
  const prev_value = quantity * prev_close;
  const day_change_pct = prev_value ? round2((day_change / prev_value) * 100) : 0;
  return {
    symbol: String(raw.symbol ?? raw.ticker ?? ""),
    name: String(raw.name ?? raw.tickerName ?? ""),
    asset_type: normalizeAssetType(raw.assetType ?? raw.category ?? raw.instrumentType),
    account_id: accountId,
    quantity,
    avg_cost,
    last_price,
    market_value,
    cost_basis,
    unrealized_pnl,
    unrealized_pnl_pct,
    day_change,
    day_change_pct,
    currency: String(raw.currency ?? "USD"),
    weight_pct: 0,
  };
}

/**
 * Map a Webull account/balance record (from get_account_list /
 * get_account_balance) to our schema.
 */
export function mapAccount(raw = {}) {
  return {
    account_id: String(raw.accountId ?? raw.account_id ?? ""),
    account_type: String(raw.accountType ?? "").toUpperCase() === "MARGIN" ? "MARGIN" : "CASH",
    display_name: String(raw.displayName ?? raw.accountType ?? "Webull"),
    currency: String(raw.currency ?? "USD"),
    net_liquidation: round2(raw.netLiquidation ?? raw.totalMarketValue ?? 0),
    total_cash: round2(raw.totalCash ?? raw.cashBalance ?? 0),
    buying_power: round2(raw.buyingPower ?? raw.totalCash ?? 0),
  };
}

/**
 * Assemble a normalized snapshot from mapped accounts + positions. Fills
 * weight_pct, totals, and allocation so the output is internally consistent.
 * Runs on every read (browser busabase-provider and demo-provider) since
 * Busabase only stores the raw mapped rows, not the aggregate rollups.
 */
export function assembleSnapshot(
  accounts = [],
  positions = [],
  { snapshot_id = "", generated_at = "", source = "kelly-invest-webull", base_currency = "", warnings = [] } = {},
) {
  const marketValueTotal = positions.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
  const withWeights = positions.map((p) => ({
    ...p,
    weight_pct: marketValueTotal ? round2((Number(p.market_value || 0) / marketValueTotal) * 100) : 0,
  }));
  const cost_basis = round2(withWeights.reduce((sum, p) => sum + Number(p.cost_basis || 0), 0));
  const unrealized_pnl = round2(marketValueTotal - cost_basis);
  const day_change = round2(withWeights.reduce((sum, p) => sum + Number(p.day_change || 0), 0));
  const prev_value = withWeights.reduce((sum, p) => sum + (Number(p.market_value || 0) - Number(p.day_change || 0)), 0);
  const total_cash = round2(accounts.reduce((sum, a) => sum + Number(a.total_cash || 0), 0));
  const byType = new Map();
  for (const p of withWeights) {
    byType.set(p.asset_type, round2((byType.get(p.asset_type) || 0) + Number(p.market_value || 0)));
  }
  const allocation = [...byType.entries()]
    .map(([asset_type, market_value]) => ({
      asset_type,
      market_value: round2(market_value),
      weight_pct: marketValueTotal ? round2((market_value / marketValueTotal) * 100) : 0,
    }))
    .sort((a, b) => b.market_value - a.market_value);
  return {
    schema_version: "1",
    snapshot_id: snapshot_id || `webull-${Date.now()}`,
    generated_at: generated_at || new Date().toISOString(),
    source,
    base_currency: base_currency || accounts[0]?.currency || "USD",
    accounts,
    positions: withWeights,
    totals: {
      market_value: round2(marketValueTotal),
      cost_basis,
      unrealized_pnl,
      unrealized_pnl_pct: cost_basis ? round2((unrealized_pnl / cost_basis) * 100) : 0,
      day_change,
      day_change_pct: prev_value ? round2((day_change / prev_value) * 100) : 0,
      total_cash,
    },
    allocation,
    warnings,
  };
}

/**
 * Compute read-only observations from a portfolio snapshot. Insights are
 * neutral facts/flags, never advice or actions. No buy/sell/rebalance
 * suggestions, nothing executable.
 */
export function computeInsights(snapshot, targetAllocation = DEFAULT_TARGET_ALLOCATION) {
  if (!snapshot || !Array.isArray(snapshot.positions) || snapshot.positions.length === 0) {
    return [];
  }
  const positions = snapshot.positions;
  const totals = snapshot.totals || {};
  const allocation = Array.isArray(snapshot.allocation) ? snapshot.allocation : [];
  const targets = targetAllocation || DEFAULT_TARGET_ALLOCATION;
  const insights = [];

  // 1. single_position_concentration — largest position by weight.
  const largest = positions.reduce(
    (best, p) => (Number(p.weight_pct || 0) > Number(best?.weight_pct || 0) ? p : best),
    null,
  );
  if (largest) {
    const pct = round2(Number(largest.weight_pct || 0));
    if (pct >= 20 || pct >= 12) {
      insights.push({
        id: `single-position-concentration-${largest.symbol}`,
        code: "single_position_concentration",
        severity: pct >= 20 ? "high" : "watch",
        category: "concentration",
        params: { symbol: largest.symbol, pct },
      });
    }
  }

  // 2. crypto_concentration — total CRYPTO allocation weight.
  const cryptoSlice = allocation.find((slice) => slice.asset_type === "CRYPTO");
  if (cryptoSlice) {
    const pct = round2(Number(cryptoSlice.weight_pct || 0));
    if (pct >= 15) {
      insights.push({
        id: "crypto-concentration",
        code: "crypto_concentration",
        severity: pct >= 25 ? "high" : "watch",
        category: "concentration",
        params: { pct },
      });
    }
  }

  // 3. allocation_drift — one insight per asset class drifting >= 10pp.
  const actualByType = new Map();
  for (const slice of allocation) {
    actualByType.set(slice.asset_type, round2(Number(slice.weight_pct || 0)));
  }
  const marketValue = Number(totals.market_value || 0);
  const cashPctForDrift = marketValue > 0 ? round2((Number(totals.total_cash || 0) / marketValue) * 100) : 0;
  if (targets.CASH != null) actualByType.set("CASH", cashPctForDrift);
  for (const assetType of Object.keys(targets)) {
    const target = Number(targets[assetType] || 0);
    const actual = actualByType.has(assetType) ? actualByType.get(assetType) : 0;
    const delta = round2(actual - target);
    if (Math.abs(delta) >= 10) {
      insights.push({
        id: `allocation-drift-${assetType}`,
        code: "allocation_drift",
        severity: "watch",
        category: "drift",
        params: { asset_type: assetType, actual, target, delta },
      });
    }
  }

  // 4. cash_drag — cash as a percentage of market value.
  if (marketValue > 0) {
    const cashPct = round2((Number(totals.total_cash || 0) / marketValue) * 100);
    if (cashPct >= 15) {
      insights.push({
        id: "cash-drag",
        code: "cash_drag",
        severity: "watch",
        category: "cash",
        params: { pct: cashPct },
      });
    }
  }

  // 5. negative_cash — margin/negative cash balance.
  if (Number(totals.total_cash || 0) < 0) {
    insights.push({
      id: "negative-cash",
      code: "negative_cash",
      severity: "watch",
      category: "cash",
      params: { amount: round2(Number(totals.total_cash || 0)) },
    });
  }

  // 6. top_gainer — position with highest positive unrealized P/L %.
  const gainer = positions.reduce(
    (best, p) =>
      Number(p.unrealized_pnl_pct || 0) > Number(best?.unrealized_pnl_pct ?? Number.NEGATIVE_INFINITY) ? p : best,
    null,
  );
  if (gainer && Number(gainer.unrealized_pnl_pct || 0) > 0) {
    insights.push({
      id: `top-gainer-${gainer.symbol}`,
      code: "top_gainer",
      severity: "info",
      category: "performance",
      params: { symbol: gainer.symbol, pct: round2(Number(gainer.unrealized_pnl_pct || 0)) },
    });
  }

  // 7. top_laggard — position with lowest negative unrealized P/L %.
  const laggard = positions.reduce(
    (worst, p) =>
      Number(p.unrealized_pnl_pct || 0) < Number(worst?.unrealized_pnl_pct ?? Number.POSITIVE_INFINITY) ? p : worst,
    null,
  );
  if (laggard && Number(laggard.unrealized_pnl_pct || 0) < 0) {
    insights.push({
      id: `top-laggard-${laggard.symbol}`,
      code: "top_laggard",
      severity: "info",
      category: "performance",
      params: { symbol: laggard.symbol, pct: round2(Number(laggard.unrealized_pnl_pct || 0)) },
    });
  }

  // Order by severity desc, then by magnitude of the primary param. Cap at 6.
  const magnitude = (insight) => {
    const p = insight.params || {};
    return Math.abs(Number(p.pct ?? p.delta ?? p.amount ?? 0));
  };
  insights.sort((a, b) => {
    const sev = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (sev !== 0) return sev;
    return magnitude(b) - magnitude(a);
  });

  return insights.slice(0, 6);
}
