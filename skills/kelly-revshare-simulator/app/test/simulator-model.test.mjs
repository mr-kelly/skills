import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBatch,
  buildConfigSummary,
  buildScenario,
  computeRiskFlags,
  normalizeScenarioRow,
  recomputeMetrics,
  scenarioToFields,
  simulateScenario,
} from "../app/js/simulator-model.js";

// Worked example ported verbatim from references/ui-schema.md / the retired
// scripts/generate_batch.ts "bubble-tea-chain" seed scenario, cross-checked
// against the original lib/simulate.ts via bunx tsx before porting.
const BUBBLE_TEA_INPUT = {
  business_type: "Bubble tea retail chain",
  avg_monthly_revenue: 420000,
  revenue_volatility_pct: 18,
  principal: 250000,
  initial_share_rate_pct: 6,
  step_down_share_rate_pct: 3,
  repayment_cap_multiple: 1.4,
  term_months: 18,
};

test("simulateScenario: bubble tea chain worked example matches the original lib/simulate.ts output", () => {
  const result = simulateScenario(BUBBLE_TEA_INPUT);
  assert.equal(result.cap_amount, 350000);
  assert.equal(result.total_repayment, 350000);
  assert.equal(result.months_to_breakeven, 10);
  assert.equal(result.months_to_cap, 18);
  assert.equal(result.cash_flow_payout_multiple, 1.07);
  assert.equal(result.effective_annual_cost_pct, 25.15);
  assert.equal(result.monthly.length, 18);
  assert.deepEqual(result.monthly[0], {
    month: 1,
    revenue: 420000,
    share_rate_pct: 6,
    payment: 25200,
    cumulative_repayment: 25200,
    breakeven_reached: false,
    cap_reached: false,
  });
  const lastMonth = result.monthly.at(-1);
  assert.equal(lastMonth.cap_reached, true);
  assert.equal(lastMonth.cumulative_repayment, 350000);
  // Only thin_term_buffer should trip -- cap is reached in the final month,
  // cost is well under the 40% threshold, volatility is below 30%.
  assert.deepEqual(
    result.risk_flags.map((f) => f.code),
    ["thin_term_buffer"],
  );
});

test("simulateScenario: risky discount-mart example never reaches its cap and flags high volatility", () => {
  const result = simulateScenario({
    business_type: "Discount retail mart",
    avg_monthly_revenue: 150000,
    revenue_volatility_pct: 35,
    principal: 300000,
    initial_share_rate_pct: 14,
    step_down_share_rate_pct: 10,
    repayment_cap_multiple: 2,
    term_months: 12,
  });
  assert.equal(result.cap_amount, 600000);
  assert.equal(result.months_to_cap, null);
  assert.equal(result.months_to_breakeven, null);
  assert.deepEqual(
    result.risk_flags.map((f) => f.code),
    ["cap_not_reached", "high_revenue_volatility"],
  );
});

test("simulateScenario: step-down rate applies only starting the month after principal is recovered", () => {
  const result = simulateScenario({
    avg_monthly_revenue: 100000,
    principal: 50000,
    initial_share_rate_pct: 10,
    step_down_share_rate_pct: 2,
    repayment_cap_multiple: 3,
    term_months: 24,
  });
  // $100,000 * 10% = $10,000/month -> breakeven ($50,000) is reached exactly
  // at month 5. The rate used FOR a given month's payment is decided by the
  // cumulative total BEFORE that month's payment, so the breakeven month
  // itself still uses the initial rate; only the following month steps down.
  assert.equal(result.months_to_breakeven, 5);
  const breakevenMonth = result.monthly[result.months_to_breakeven - 1];
  const nextMonth = result.monthly[result.months_to_breakeven];
  assert.equal(breakevenMonth.breakeven_reached, true);
  assert.equal(breakevenMonth.share_rate_pct, 10);
  assert.equal(nextMonth.share_rate_pct, 2);
});

test("simulateScenario: cap_amount is always principal * repayment_cap_multiple (internal consistency guard)", () => {
  for (const cap of [1.2, 1.5, 2, 2.5]) {
    const result = simulateScenario({
      avg_monthly_revenue: 200000,
      principal: 100000,
      initial_share_rate_pct: 8,
      step_down_share_rate_pct: 4,
      repayment_cap_multiple: cap,
      term_months: 30,
    });
    assert.equal(result.cap_amount, 100000 * cap);
  }
});

test("computeRiskFlags: merchant_cost_too_high trips above the 40% comfort threshold", () => {
  const flags = computeRiskFlags(
    { term_months: 12, revenue_volatility_pct: 5 },
    { totalRepayment: 180000, capAmount: 180000, monthsToCap: 6, effectiveAnnualCostPct: 55.2 },
  );
  assert.ok(flags.some((f) => f.code === "merchant_cost_too_high"));
});

test("buildScenario: assembles id/created_at/decision defaults and computes result fresh", () => {
  const scenario = buildScenario("Test Scenario", BUBBLE_TEA_INPUT, "scn_fixed");
  assert.equal(scenario.id, "scn_fixed");
  assert.equal(scenario.name, "Test Scenario");
  assert.deepEqual(scenario.decision, { action: null, note: "", decided_at: null });
  assert.equal(scenario.result.cap_amount, 350000);
});

test("recomputeMetrics / buildBatch: counts scenarios by decision action", () => {
  const scenarios = [
    buildScenario("A", BUBBLE_TEA_INPUT, "a"),
    {
      ...buildScenario("B", BUBBLE_TEA_INPUT, "b"),
      decision: { action: "approve_underwriting", note: "", decided_at: "x" },
    },
    { ...buildScenario("C", BUBBLE_TEA_INPUT, "c"), decision: { action: "reject", note: "", decided_at: "x" } },
    { ...buildScenario("D", BUBBLE_TEA_INPUT, "d"), decision: { action: "needs_revision", note: "", decided_at: "x" } },
  ];
  const metrics = recomputeMetrics(scenarios);
  assert.deepEqual(metrics, { total: 4, approved: 1, needs_revision: 1, rejected: 1, undecided: 1 });
  const batch = buildBatch(scenarios, { batchId: "test-batch", generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(batch.batch_id, "test-batch");
  assert.equal(batch.scenarios.length, 4);
  assert.deepEqual(batch.metrics, metrics);
});

test("normalizeScenarioRow / scenarioToFields round-trip a Busabase row", () => {
  const scenario = buildScenario("Round Trip", BUBBLE_TEA_INPUT, "scn_roundtrip");
  scenario.decision = { action: "approve_underwriting", note: "Looks good", decided_at: "2026-01-01T00:00:00.000Z" };
  const fields = scenarioToFields(scenario);
  assert.equal(fields.scenario_id, "scn_roundtrip");
  assert.equal(fields.principal, 250000);
  assert.equal(fields.decision_action, "approve_underwriting");

  const normalized = normalizeScenarioRow(fields);
  assert.equal(normalized.id, "scn_roundtrip");
  assert.equal(normalized.input.principal, 250000);
  assert.equal(normalized.decision.action, "approve_underwriting");
  assert.equal(normalized.decision.note, "Looks good");
  // result is always recomputed fresh, never read from the row.
  assert.equal(normalized.result.cap_amount, 350000);
  assert.equal(normalized.result.cash_flow_payout_multiple, 1.07);
});

test("normalizeScenarioRow: undecided scenario (no decision_action) normalizes to emptyDecision()", () => {
  const normalized = normalizeScenarioRow({ scenario_id: "scn_x", name: "X", principal: 100000, term_months: 12 });
  assert.deepEqual(normalized.decision, { action: null, note: "", decided_at: null });
});

test("buildConfigSummary: defaults when no config row exists, merges policy overrides when present", () => {
  const empty = buildConfigSummary([]);
  assert.equal(empty.is_example, true);
  assert.equal(empty.base_currency, "USD");
  assert.equal(empty.underwriting_policy.max_effective_annual_cost_pct, 40);

  const withConfig = buildConfigSummary([
    {
      kind: "config",
      payload: JSON.stringify({ base_currency: "EUR", underwriting_policy: { max_term_months: 48 } }),
    },
  ]);
  assert.equal(withConfig.is_example, false);
  assert.equal(withConfig.base_currency, "EUR");
  assert.equal(withConfig.underwriting_policy.max_term_months, 48);
  // Unspecified policy fields still fall back to DEFAULT_POLICY.
  assert.equal(withConfig.underwriting_policy.max_effective_annual_cost_pct, 40);
});
