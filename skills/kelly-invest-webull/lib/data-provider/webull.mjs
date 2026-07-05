// Webull OpenAPI data-provider adapter (skill-side, read-only).
//
// This is the live provider named `webull`. The APP never imports this module —
// it only ever reads the normalized snapshot (app/.data/snapshot.json) and the
// demo payload. This adapter runs skill-side: it reads Webull holdings via the
// official SDK and writes a normalized snapshot that matches
// references/portfolio-schema.md.
//
// Provider selection follows the same seam as the rest of the app:
//   KELLY_INVEST_WEBULL_DATA_PROVIDER=local   (default) — read a hand-written
//                                             or generated snapshot.json
//   KELLY_INVEST_WEBULL_DATA_PROVIDER=webull  — use this live adapter.
//
// Grounding (verify against current Webull OpenAPI docs before wiring live):
//   - Auth: App Key + App Secret, signed requests, region id "us". Credentials
//     come from Webull's OpenAPI Management/Portal (1-2 business day review).
//     A UAT test host exists at us-openapi-alb.uat.webullbroker.com.
//   - Official SDK: webull-openapi-python-sdk. Relevant client methods:
//     get_account_list(), get_account_balance(), get_account_positions().
//   - Rate limit ~10 requests / 30 seconds per App ID — batch and back off.
//
// READ-ONLY BOUNDARY: this adapter must never place, modify, or cancel orders,
// and never move money. It only reads account/balance/position data.
//
// Secrets: never hardcode. Reference env var NAMES in config
// (webull.app_key_env / webull.app_secret_env) and read the values from the
// environment at call time.

/**
 * Resolve Webull App Key / App Secret from config-referenced env var names.
 * @param {object} config parsed config (config.local.json / example)
 * @returns {{ appKey: string, appSecret: string, region: string, baseUrl: string, allowlist: string[] }}
 */
export function resolveWebullCredentials(config = {}) {
  const webull = config.webull || {};
  const appKeyEnv = webull.app_key_env || "KELLY_INVEST_WEBULL_APP_KEY";
  const appSecretEnv = webull.app_secret_env || "KELLY_INVEST_WEBULL_APP_SECRET";
  return {
    appKey: process.env[appKeyEnv] || "",
    appSecret: process.env[appSecretEnv] || "",
    region: webull.region || "us",
    baseUrl: webull.base_url || "https://us-openapi.webullbroker.com",
    allowlist: Array.isArray(webull.account_allowlist) ? webull.account_allowlist : [],
  };
}

const ASSET_TYPE_MAP = {
  STOCK: "STOCK",
  EQUITY: "STOCK",
  ETF: "ETF",
  FUND: "ETF",
  OPTION: "OPTION",
  CRYPTO: "CRYPTO",
  CRYPTOCURRENCY: "CRYPTO",
};

/**
 * Normalize a Webull instrument/category label to our asset_type enum.
 * @param {string} raw
 * @returns {"STOCK"|"ETF"|"OPTION"|"CRYPTO"|"OTHER"}
 */
export function normalizeAssetType(raw) {
  return ASSET_TYPE_MAP[String(raw || "").toUpperCase()] || "OTHER";
}

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Map a Webull position record (from get_account_positions) to our schema.
 * Field names below are the expected SDK shape; verify against live responses,
 * since the exact REST JSON is behind the SDK.
 * @param {object} raw Webull position
 * @param {string} accountId our local account id
 * @returns {object} normalized position (weight_pct filled in later)
 */
export function mapPosition(raw = {}, accountId = "") {
  const quantity = Number(raw.quantity ?? raw.position ?? 0);
  const avg_cost = Number(raw.costPrice ?? raw.avgCost ?? 0);
  const last_price = Number(raw.lastPrice ?? raw.marketPrice ?? 0);
  const prev_close = Number(raw.prevClose ?? raw.lastPrice ?? last_price);
  const market_value = round2(raw.marketValue != null ? Number(raw.marketValue) : quantity * last_price);
  const cost_basis = round2(quantity * avg_cost);
  const unrealized_pnl = round2(raw.unrealizedProfitLoss != null ? Number(raw.unrealizedProfitLoss) : market_value - cost_basis);
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
 * @param {object} raw Webull account
 * @returns {object} normalized account
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
 * weight_pct, totals, and allocation so the output is internally consistent and
 * passes scripts/validate_ui_schema.mjs.
 * @param {object[]} accounts normalized accounts
 * @param {object[]} positions normalized positions (weight_pct may be 0)
 * @returns {object} snapshot per references/portfolio-schema.md
 */
export function assembleSnapshot(accounts, positions) {
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
    snapshot_id: `webull-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    source: "kelly-invest-webull",
    base_currency: accounts[0]?.currency || "USD",
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
    warnings: [],
  };
}
