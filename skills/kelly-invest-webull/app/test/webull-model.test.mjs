import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleSnapshot,
  computeInsights,
  mapAccount,
  mapPosition,
  normalizeAssetType,
  resolveWebullCredentials,
} from "../app/js/webull-model.js";

// ---- Fixtures shaped like the raw Webull SDK payloads documented in the
// retired lib/data-provider/webull.ts (get_account_list / get_account_balance
// / get_account_positions). Used to exercise the mapping logic the trusted
// sync script depends on without any live network access.

const rawAccountCash = {
  accountId: "acc-cash-1",
  accountType: "CASH",
  displayName: "Webull Cash",
  currency: "USD",
  netLiquidation: 12000,
  totalCash: 4000,
  buyingPower: 4000,
};

const rawAccountMargin = {
  account_id: "acc-margin-1",
  accountType: "MARGIN",
  currency: "USD",
  totalMarketValue: 9000,
  cashBalance: -500,
};

const rawPositionAapl = {
  symbol: "AAPL",
  tickerName: "Apple Inc.",
  assetType: "STOCK",
  quantity: 50,
  costPrice: 150,
  lastPrice: 200,
  prevClose: 195,
  currency: "USD",
};

const rawPositionCrypto = {
  ticker: "BTC-USD",
  name: "Bitcoin",
  category: "CRYPTOCURRENCY",
  position: 0.2,
  avgCost: 30000,
  marketPrice: 60000,
  currency: "USD",
};

test("normalizeAssetType maps known Webull labels and falls back to OTHER", () => {
  assert.equal(normalizeAssetType("EQUITY"), "STOCK");
  assert.equal(normalizeAssetType("fund"), "ETF");
  assert.equal(normalizeAssetType("cryptocurrency"), "CRYPTO");
  assert.equal(normalizeAssetType("FUTURES"), "OTHER");
  assert.equal(normalizeAssetType(undefined), "OTHER");
});

test("mapAccount normalizes both accountId/account_id and camelCase/snake_case balance fields", () => {
  const cash = mapAccount(rawAccountCash);
  assert.deepEqual(cash, {
    account_id: "acc-cash-1",
    account_type: "CASH",
    display_name: "Webull Cash",
    currency: "USD",
    net_liquidation: 12000,
    total_cash: 4000,
    buying_power: 4000,
  });

  const margin = mapAccount(rawAccountMargin);
  assert.equal(margin.account_id, "acc-margin-1");
  assert.equal(margin.account_type, "MARGIN");
  assert.equal(margin.net_liquidation, 9000); // falls back to totalMarketValue
  assert.equal(margin.total_cash, -500); // falls back to cashBalance, negative preserved
  assert.equal(margin.buying_power, 0); // no buyingPower and no totalCash to fall back to
});

test("mapPosition computes market_value/cost_basis/P&L/day_change from raw quote fields", () => {
  const mapped = mapPosition(rawPositionAapl, "acc-cash-1");
  assert.equal(mapped.symbol, "AAPL");
  assert.equal(mapped.asset_type, "STOCK");
  assert.equal(mapped.account_id, "acc-cash-1");
  assert.equal(mapped.market_value, 10000); // 50 * 200
  assert.equal(mapped.cost_basis, 7500); // 50 * 150
  assert.equal(mapped.unrealized_pnl, 2500);
  assert.equal(mapped.unrealized_pnl_pct, round1((2500 / 7500) * 100));
  assert.equal(mapped.day_change, 250); // 50 * (200 - 195)
});

test("mapPosition supports the alternate field-name set (position/avgCost/marketPrice/category)", () => {
  const mapped = mapPosition(rawPositionCrypto, "acc-cash-1");
  assert.equal(mapped.symbol, "BTC-USD");
  assert.equal(mapped.name, "Bitcoin");
  assert.equal(mapped.asset_type, "CRYPTO");
  assert.equal(mapped.quantity, 0.2);
  assert.equal(mapped.avg_cost, 30000);
  assert.equal(mapped.last_price, 60000);
  assert.equal(mapped.market_value, 12000);
  assert.equal(mapped.cost_basis, 6000);
  assert.equal(mapped.unrealized_pnl, 6000);
});

test("resolveWebullCredentials reads env var names referenced by config, not literal secrets", () => {
  process.env.TEST_WEBULL_KEY = "app-key-value";
  process.env.TEST_WEBULL_SECRET = "app-secret-value";
  const credentials = resolveWebullCredentials({
    webull: {
      app_key_env: "TEST_WEBULL_KEY",
      app_secret_env: "TEST_WEBULL_SECRET",
      region: "us",
      base_url: "https://example.test",
      account_allowlist: ["acc-cash-1"],
    },
  });
  assert.equal(credentials.appKey, "app-key-value");
  assert.equal(credentials.appSecret, "app-secret-value");
  assert.equal(credentials.region, "us");
  assert.equal(credentials.baseUrl, "https://example.test");
  assert.deepEqual(credentials.allowlist, ["acc-cash-1"]);
  process.env.TEST_WEBULL_KEY = undefined;
  process.env.TEST_WEBULL_SECRET = undefined;
});

test("resolveWebullCredentials defaults to the documented env var names and US region", () => {
  const credentials = resolveWebullCredentials();
  assert.equal(credentials.appKey, "");
  assert.equal(credentials.region, "us");
  assert.equal(credentials.baseUrl, "https://us-openapi.webullbroker.com");
});

test("assembleSnapshot fills weight_pct, totals, and allocation from mapped rows", () => {
  const accounts = [mapAccount(rawAccountCash)];
  const positions = [mapPosition(rawPositionAapl, "acc-cash-1"), mapPosition(rawPositionCrypto, "acc-cash-1")];
  const snapshot = assembleSnapshot(accounts, positions, {
    snapshot_id: "test-1",
    generated_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(snapshot.schema_version, "1");
  assert.equal(snapshot.snapshot_id, "test-1");
  assert.equal(snapshot.totals.market_value, 22000); // 10000 + 12000
  assert.equal(snapshot.totals.cost_basis, 13500); // 7500 + 6000
  assert.equal(snapshot.totals.unrealized_pnl, 8500);
  const aapl = snapshot.positions.find((p) => p.symbol === "AAPL");
  assert.equal(aapl.weight_pct, round1((10000 / 22000) * 100));
  const stockSlice = snapshot.allocation.find((a) => a.asset_type === "STOCK");
  const cryptoSlice = snapshot.allocation.find((a) => a.asset_type === "CRYPTO");
  assert.equal(stockSlice.market_value, 10000);
  assert.equal(cryptoSlice.market_value, 12000);
});

test("assembleSnapshot defaults base_currency from the first account and generates ids when omitted", () => {
  const snapshot = assembleSnapshot([mapAccount(rawAccountCash)], []);
  assert.equal(snapshot.base_currency, "USD");
  assert.ok(snapshot.snapshot_id.startsWith("webull-"));
  assert.equal(snapshot.totals.market_value, 0);
});

test("computeInsights flags single-position concentration above the high threshold", () => {
  const accounts = [mapAccount(rawAccountCash)];
  const positions = [mapPosition(rawPositionAapl, "acc-cash-1")];
  const snapshot = assembleSnapshot(accounts, positions);
  const insights = computeInsights(snapshot);
  const concentration = insights.find((i) => i.code === "single_position_concentration");
  assert.ok(concentration);
  assert.equal(concentration.severity, "high");
  assert.equal(concentration.params.symbol, "AAPL");
});

test("computeInsights returns nothing for a snapshot with no positions", () => {
  const snapshot = assembleSnapshot([], []);
  assert.deepEqual(computeInsights(snapshot), []);
});

test("computeInsights flags negative cash for a margin account draw-down", () => {
  const accounts = [mapAccount(rawAccountMargin)];
  const positions = [mapPosition(rawPositionAapl, "acc-margin-1")];
  const snapshot = assembleSnapshot(accounts, positions);
  const insights = computeInsights(snapshot);
  const negativeCash = insights.find((i) => i.code === "negative_cash");
  assert.ok(negativeCash);
  assert.equal(negativeCash.params.amount, -500);
});

function round1(value) {
  return Math.round(value * 100) / 100;
}
