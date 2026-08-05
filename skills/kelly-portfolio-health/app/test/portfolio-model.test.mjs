import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RISK_POLICY,
  applyContractDecision,
  baseContractFields,
  buildConfigSummary,
  buildSnapshot,
  computeInsights,
  normalizeContractRow,
  riskPolicyFromConfig,
  round2,
} from "../app/js/portfolio-model.js";

// Two hand-worked contracts:
// A: 100k funding, 1.2x cap (120k), 12/24 months elapsed (expected 50%),
//    30k collected (actual 25%) -> lag 25pp -> "high" severity (>= 25).
//    Revenue drops from a 10k baseline to 7k -> -30% decline -> watchlist.
// B: 50k funding, 1.1x cap (55k), 6/12 months elapsed (expected 50%),
//    27.5k collected (actual 50%) -> lag 0pp -> "ok" severity.
//    Revenue rises from a 5k baseline to 5.2k -> +4% -> not in watchlist.
const CONTRACT_A = {
  id: "rbf-a",
  business_name: "Retail Partner A",
  category: "Retail",
  city: "Riverton",
  months_since_origination: 12,
  expected_term_months: 24,
  funding_amount: 100000,
  cap_multiple: 1.2,
  cap_amount: 120000,
  cumulative_repayment: 30000,
  monthly_revenue: [10000, 10000, 10000, 10000, 10000, 7000],
  status: "active",
};

const CONTRACT_B = {
  id: "rbf-b",
  business_name: "Food Partner B",
  category: "Food & Beverage",
  city: "Fairview",
  months_since_origination: 6,
  expected_term_months: 12,
  funding_amount: 50000,
  cap_multiple: 1.1,
  cap_amount: 55000,
  cumulative_repayment: 27500,
  monthly_revenue: [5000, 5000, 5000, 5000, 5000, 5200],
  status: "active",
};

test("round2 rounds to 2 decimal places", () => {
  assert.equal(round2(32.857142857), 32.86);
  assert.equal(round2(), 0);
});

test("computeInsights: totals and weighted-average progress", () => {
  const insights = computeInsights([CONTRACT_A, CONTRACT_B]);
  assert.equal(insights.totals.total_aum, 150000);
  assert.equal(insights.totals.total_collected, 57500);
  // (30000 + 27500) / (120000 + 55000) * 100 = 32.857142... -> 32.86
  assert.equal(insights.totals.weighted_avg_progress_pct, 32.86);
  assert.equal(insights.totals.active_count, 2);
  assert.equal(insights.totals.contract_count, 2);
});

test("computeInsights: repayment lag severity from the default risk policy", () => {
  const insights = computeInsights([CONTRACT_A, CONTRACT_B]);
  const rowA = insights.progress.find((row) => row.id === "rbf-a");
  const rowB = insights.progress.find((row) => row.id === "rbf-b");
  assert.equal(rowA.expected_pct, 50);
  assert.equal(rowA.actual_pct, 25);
  assert.equal(rowA.lag_pp, 25);
  assert.equal(rowA.severity, "high"); // >= lag_high_pp (25)
  assert.equal(rowB.lag_pp, 0);
  assert.equal(rowB.severity, "ok");
  assert.equal(insights.totals.at_risk_count, 1);
});

test("computeInsights: lag severity thresholds are driven by the risk policy argument", () => {
  const tighter = computeInsights([CONTRACT_A, CONTRACT_B], {
    ...DEFAULT_RISK_POLICY,
    lag_watch_pp: 5,
    lag_high_pp: 30,
  });
  const rowA = tighter.progress.find((row) => row.id === "rbf-a");
  assert.equal(rowA.severity, "watch"); // 25pp lag: >= 5 watch, < 30 high
});

test("computeInsights: concentration by category weights sum to ~100% of active AUM", () => {
  const insights = computeInsights([CONTRACT_A, CONTRACT_B]);
  const retail = insights.concentration_by_category.find((row) => row.key === "Retail");
  const food = insights.concentration_by_category.find((row) => row.key === "Food & Beverage");
  assert.equal(retail.funding_amount, 100000);
  assert.equal(retail.weight_pct, 66.67);
  assert.equal(food.weight_pct, 33.33);
  assert.equal(retail.contract_count, 1);
});

test("computeInsights: watchlist flags a >=10% revenue decline, sorted worst-first", () => {
  const insights = computeInsights([CONTRACT_A, CONTRACT_B]);
  assert.equal(insights.watchlist.length, 1);
  assert.equal(insights.watchlist[0].id, "rbf-a");
  assert.equal(insights.watchlist[0].decline_pct, -30);
  assert.equal(insights.watchlist[0].recent_revenue, 7000);
});

test("computeInsights: a contract with fewer than 4 months of revenue history is never on the watchlist", () => {
  const short = { ...CONTRACT_A, id: "rbf-short", monthly_revenue: [10000, 5000, 4000] };
  const insights = computeInsights([short]);
  assert.equal(insights.watchlist.length, 0);
});

test("computeInsights: delinquent status always counts as at-risk even with ok lag", () => {
  const delinquent = { ...CONTRACT_B, id: "rbf-delinquent", status: "delinquent" };
  const insights = computeInsights([delinquent]);
  assert.equal(insights.totals.at_risk_count, 1);
});

test("riskPolicyFromConfig falls back to defaults for missing keys", () => {
  assert.deepEqual(riskPolicyFromConfig({}), DEFAULT_RISK_POLICY);
  assert.deepEqual(riskPolicyFromConfig({ risk_policy: { lag_watch_pp: 8 } }), {
    ...DEFAULT_RISK_POLICY,
    lag_watch_pp: 8,
  });
});

test("buildConfigSummary reports non-secret config with defaults", () => {
  const summary = buildConfigSummary({ fund_name: "Test Fund", base_currency: "EUR" });
  assert.equal(summary.fund_name, "Test Fund");
  assert.equal(summary.base_currency, "EUR");
  assert.deepEqual(summary.risk_policy, DEFAULT_RISK_POLICY);
  assert.equal(buildConfigSummary({}).base_currency, "USD");
});

test("buildSnapshot attaches computeInsights over the given contracts", () => {
  const snapshot = buildSnapshot({ contracts: [CONTRACT_A, CONTRACT_B], configSummary: buildConfigSummary({}) });
  assert.equal(snapshot.contracts.length, 2);
  assert.equal(snapshot.insights.totals.total_aum, 150000);
  assert.equal(snapshot.base_currency, "USD");
});

test("normalizeContractRow/baseContractFields round-trip through Busabase field-slug shapes", () => {
  const row = {
    contract_id: "rbf-0001",
    business_name: "Retail Partner 001",
    category: "Retail",
    city: "Riverton",
    origination_date: "2025-03-01",
    months_since_origination: 16,
    expected_term_months: 24,
    funding_amount: 82000,
    cap_multiple: 1.28,
    cap_amount: 104960,
    cumulative_repayment: 61000,
    monthly_revenue: JSON.stringify([42000, 40500, 39800, 38200, 37000, 35600]),
    status: "active",
    currency: "USD",
    flagged: "true",
    note: "Watching closely",
    decision_updated_at: "2026-08-01T00:00:00.000Z",
  };
  const contract = normalizeContractRow(row);
  assert.equal(contract.id, "rbf-0001");
  assert.equal(contract.flagged, true);
  assert.equal(contract.months_since_origination, 16);
  assert.deepEqual(contract.monthly_revenue, [42000, 40500, 39800, 38200, 37000, 35600]);

  const fields = baseContractFields(contract);
  assert.equal(fields.contract_id, "rbf-0001");
  assert.equal(fields.flagged, "true");
  assert.equal(fields.monthly_revenue, row.monthly_revenue);
});

test("applyContractDecision merges a partial flag/note patch and stamps decision_updated_at", () => {
  const current = { flagged: false, note: "old note" };
  const flaggedOnly = applyContractDecision(current, { flagged: true }, "2026-08-06T00:00:00.000Z");
  assert.equal(flaggedOnly.flagged, true);
  assert.equal(flaggedOnly.note, "old note"); // untouched
  assert.equal(flaggedOnly.decision_updated_at, "2026-08-06T00:00:00.000Z");

  const noteOnly = applyContractDecision(flaggedOnly, { note: "new note" }, "2026-08-06T01:00:00.000Z");
  assert.equal(noteOnly.flagged, true); // untouched
  assert.equal(noteOnly.note, "new note");
});
