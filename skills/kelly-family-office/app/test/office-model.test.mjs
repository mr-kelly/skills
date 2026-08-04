import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, computeInsights } from "../app/js/office-model.js";

/** @param {any} insight */
function paramsOf(insight) {
  return insight?.params || {};
}

function fixtureSnapshot() {
  const fxRates = { USD: 1, HKD: 0.128 };
  return buildSnapshot({
    snapshot_id: "test-1",
    generated_at: "2026-02-01T00:00:00.000Z",
    base_currency: "USD",
    fx_rates: fxRates,
    entities: [
      { entity_id: "ent-1", name: "Entity One", type: "INDIVIDUAL", member: "A" },
      { entity_id: "ent-2", name: "Entity Two", type: "TRUST", member: "B" },
    ],
    accounts: [
      { account_id: "acc-1", entity_id: "ent-1", institution: "IBKR", currency: "USD" },
      { account_id: "acc-2", entity_id: "ent-2", institution: "HSBC", currency: "HKD" },
    ],
    holdings: [
      {
        holding_id: "h-1",
        entity_id: "ent-1",
        account_id: "acc-1",
        symbol: "AAPL",
        name: "Apple Inc",
        asset_class: "EQUITY",
        quantity: 10,
        cost_basis: 1000,
        market_value: 1500,
        currency: "USD",
      },
      {
        holding_id: "h-2",
        entity_id: "ent-2",
        account_id: "acc-2",
        symbol: "HKBOND",
        name: "HK Bond",
        asset_class: "BOND",
        quantity: 100,
        cost_basis: 10000,
        market_value: 10000,
        currency: "HKD",
      },
    ],
  });
}

test("buildSnapshot converts multi-currency holdings to the base currency", () => {
  const snapshot = fixtureSnapshot();
  // h-1: USD 1:1 -> market_value_base 1500, cost_basis_base 1000
  // h-2: HKD * 0.128 -> market_value_base 1280, cost_basis_base 1280
  assert.equal(snapshot.holdings[0].market_value_base, 1500);
  assert.equal(snapshot.holdings[1].market_value_base, 1280);
  assert.equal(snapshot.holdings[1].cost_basis_base, 1280);
  assert.equal(snapshot.totals.aum_base, 2780);
  assert.equal(snapshot.totals.cost_basis_base, 2280);
  assert.equal(snapshot.totals.unrealized_pnl_base, 500);
});

test("buildSnapshot rollup weights sum to ~100%", () => {
  const snapshot = fixtureSnapshot();
  const entitySum = snapshot.by_entity.reduce((sum, row) => sum + row.weight_pct, 0);
  const assetSum = snapshot.by_asset_class.reduce((sum, row) => sum + row.weight_pct, 0);
  const instSum = snapshot.by_institution.reduce((sum, row) => sum + row.weight_pct, 0);
  assert.ok(Math.abs(entitySum - 100) < 0.5, String(entitySum));
  assert.ok(Math.abs(assetSum - 100) < 0.5, String(assetSum));
  assert.ok(Math.abs(instSum - 100) < 0.5, String(instSum));
});

test("buildSnapshot computes unrealized P/L per holding and in total", () => {
  const snapshot = fixtureSnapshot();
  assert.equal(snapshot.holdings[0].unrealized_pnl_base, 500);
  assert.equal(snapshot.holdings[1].unrealized_pnl_base, 0);
  assert.equal(snapshot.totals.unrealized_pnl_pct, Math.round((500 / 2280) * 100 * 100) / 100);
});

test("buildSnapshot flags holdings with no configured FX rate", () => {
  const snapshot = buildSnapshot({
    base_currency: "USD",
    fx_rates: { USD: 1 },
    entities: [{ entity_id: "ent-1", name: "Entity One", type: "INDIVIDUAL" }],
    accounts: [{ account_id: "acc-1", entity_id: "ent-1", institution: "IBKR", currency: "CNY" }],
    holdings: [
      {
        holding_id: "h-1",
        entity_id: "ent-1",
        account_id: "acc-1",
        symbol: "CNY",
        name: "CNY Cash",
        asset_class: "CASH",
        quantity: 1000,
        cost_basis: 1000,
        market_value: 1000,
        currency: "CNY",
      },
    ],
  });
  assert.equal(snapshot.holdings[0].market_value_base, 1000); // 1:1 fallback
  assert.ok(snapshot.warnings.some((w) => w.id === "fx-missing-h-1"));
});

test("computeInsights returns nothing for an empty snapshot", () => {
  const snapshot = buildSnapshot({ entities: [], accounts: [], holdings: [] });
  assert.deepEqual(computeInsights(snapshot), []);
});

test("computeInsights flags asset-class concentration above threshold", () => {
  const snapshot = buildSnapshot({
    base_currency: "USD",
    fx_rates: { USD: 1 },
    entities: [{ entity_id: "ent-1", name: "Entity One", type: "INDIVIDUAL" }],
    accounts: [{ account_id: "acc-1", entity_id: "ent-1", institution: "IBKR", currency: "USD" }],
    holdings: [
      {
        holding_id: "h-1",
        entity_id: "ent-1",
        account_id: "acc-1",
        symbol: "BTC",
        name: "Bitcoin",
        asset_class: "CRYPTO",
        quantity: 1,
        cost_basis: 50000,
        market_value: 90000,
        currency: "USD",
      },
      {
        holding_id: "h-2",
        entity_id: "ent-1",
        account_id: "acc-1",
        symbol: "USD",
        name: "USD Cash",
        asset_class: "CASH",
        quantity: 10000,
        cost_basis: 10000,
        market_value: 10000,
        currency: "USD",
      },
    ],
  });
  const insights = computeInsights(snapshot);
  const concentration = insights.find((i) => i.code === "asset_class_concentration");
  assert.ok(concentration);
  assert.equal(concentration.severity, "high");
  assert.equal(paramsOf(concentration).asset_class, "CRYPTO");
});

test("computeInsights flags entity concentration above 50%", () => {
  const snapshot = buildSnapshot({
    base_currency: "USD",
    fx_rates: { USD: 1 },
    entities: [
      { entity_id: "ent-1", name: "Entity One", type: "INDIVIDUAL" },
      { entity_id: "ent-2", name: "Entity Two", type: "TRUST" },
    ],
    accounts: [
      { account_id: "acc-1", entity_id: "ent-1", institution: "IBKR", currency: "USD" },
      { account_id: "acc-2", entity_id: "ent-2", institution: "HSBC", currency: "USD" },
    ],
    holdings: [
      {
        holding_id: "h-1",
        entity_id: "ent-1",
        account_id: "acc-1",
        symbol: "AAPL",
        name: "Apple",
        asset_class: "EQUITY",
        quantity: 1,
        cost_basis: 80000,
        market_value: 80000,
        currency: "USD",
      },
      {
        holding_id: "h-2",
        entity_id: "ent-2",
        account_id: "acc-2",
        symbol: "USD",
        name: "USD Cash",
        asset_class: "CASH",
        quantity: 20000,
        cost_basis: 20000,
        market_value: 20000,
        currency: "USD",
      },
    ],
  });
  const insights = computeInsights(snapshot);
  const entityConcentration = insights.find((i) => i.code === "entity_concentration");
  assert.ok(entityConcentration);
  assert.equal(paramsOf(entityConcentration).name, "Entity One");
});
