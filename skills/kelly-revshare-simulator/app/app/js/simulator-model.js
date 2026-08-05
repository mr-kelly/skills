// Pure domain logic for the Revenue-Share Contract Simulator, ported
// verbatim (same variable names, same order of operations, only TS types
// stripped) from the retired lib/simulate.ts and app/server/store.ts. Shared
// by three callers that must always agree: the live Busabase read/write path
// (js/providers/busabase-provider.js), the offline ?demo= scenario
// (js/providers/demo-provider.js), and the unit tests.
//
// Domain: a funder advances `principal` to an SME (retail/F&B chain store) in
// exchange for a percentage of monthly revenue ("revenue share") until a
// repayment cap multiple of the principal is reached, or the term ends. The
// share rate steps down once the principal itself has been recovered
// ("breakeven") -- a common merchant-cash-advance / RBF structure.
//
// Pure deterministic math, no external calls, no randomness -- same input
// always produces the same output.

const round2 = (value = 0) => Math.round(value * 100) / 100;

/**
 * Project monthly revenue-share payments and cumulative repayment across the
 * contract term. Revenue is held flat at the scenario's average -- volatility
 * is used only as a risk signal (see computeRiskFlags), not as a stochastic
 * driver, to keep the projection deterministic.
 */
export function simulateScenario({
  business_type = "",
  avg_monthly_revenue = 0,
  revenue_volatility_pct = 0,
  principal = 0,
  initial_share_rate_pct = 0,
  step_down_share_rate_pct = 0,
  repayment_cap_multiple = 1,
  term_months = 0,
} = {}) {
  const input = {
    business_type,
    avg_monthly_revenue,
    revenue_volatility_pct,
    principal,
    initial_share_rate_pct,
    step_down_share_rate_pct,
    repayment_cap_multiple,
    term_months,
  };

  const capAmount = round2(principal * repayment_cap_multiple);
  const monthly = [];
  let cumulative = 0;
  let breakevenMonth = null;
  let capMonth = null;

  for (let month = 1; month <= term_months; month += 1) {
    if (cumulative >= capAmount) break;
    const breakevenReached = cumulative >= principal;
    const rate = breakevenReached ? step_down_share_rate_pct : initial_share_rate_pct;
    let payment = round2(avg_monthly_revenue * (rate / 100));
    if (cumulative + payment > capAmount) payment = round2(capAmount - cumulative);
    cumulative = round2(cumulative + payment);
    if (breakevenMonth === null && cumulative >= principal) breakevenMonth = month;
    const capReached = cumulative >= capAmount;
    if (capReached && capMonth === null) capMonth = month;
    monthly.push({
      month,
      revenue: round2(avg_monthly_revenue),
      share_rate_pct: rate,
      payment,
      cumulative_repayment: cumulative,
      breakeven_reached: breakevenMonth !== null,
      cap_reached: capReached,
    });
  }

  const totalRepayment = cumulative;
  const monthsElapsed = monthly.length || term_months;

  // Cash-Flow Payout Multiple: a P/E-like ratio -- "price" is the principal
  // advanced, "earnings" is the annualized cash flow the merchant pays back.
  // A LOW multiple means the investor recovers principal faster relative to
  // the annualized cash flow (attractive to the investor/funder) -- it does
  // NOT by itself mean the deal is cheaper for the merchant. Merchant cost
  // is measured separately below via effective_annual_cost_pct.
  const annualizedRepaymentCashFlow = monthsElapsed > 0 ? (totalRepayment / monthsElapsed) * 12 : 0;
  const cashFlowPayoutMultiple =
    annualizedRepaymentCashFlow > 0 ? round2(principal / annualizedRepaymentCashFlow) : null;

  // Effective annualized merchant cost: the annualized growth rate implied by
  // paying back totalRepayment over monthsElapsed, expressed like an APR.
  let effectiveAnnualCostPct = null;
  if (principal > 0 && totalRepayment > 0 && monthsElapsed > 0) {
    const ratio = totalRepayment / principal;
    effectiveAnnualCostPct = round2((ratio ** (12 / monthsElapsed) - 1) * 100);
  }

  const riskFlags = computeRiskFlags(input, {
    totalRepayment,
    capAmount,
    monthsToCap: capMonth,
    effectiveAnnualCostPct,
  });

  return {
    monthly,
    total_repayment: totalRepayment,
    cap_amount: capAmount,
    months_to_breakeven: breakevenMonth,
    months_to_cap: capMonth,
    cash_flow_payout_multiple: cashFlowPayoutMultiple,
    effective_annual_cost_pct: effectiveAnnualCostPct,
    risk_flags: riskFlags,
  };
}

const MERCHANT_COST_HIGH_THRESHOLD_PCT = 40;
const VOLATILITY_HIGH_THRESHOLD_PCT = 30;

/**
 * Deterministic, rule-based READ-ONLY risk flags -- neutral observations for
 * an underwriter, never automated approve/reject decisions.
 */
export function computeRiskFlags(
  { term_months = 0, revenue_volatility_pct = 0 } = {},
  { totalRepayment = 0, capAmount = 0, monthsToCap = null, effectiveAnnualCostPct = null } = {},
) {
  const flags = [];

  if (monthsToCap === null) {
    flags.push({
      code: "cap_not_reached",
      severity: "high",
      message: `Repayment cap (${capAmount.toFixed(0)}) is not reached within the ${term_months}-month term; total projected repayment is ${totalRepayment.toFixed(0)}.`,
    });
  }

  if (effectiveAnnualCostPct !== null && effectiveAnnualCostPct > MERCHANT_COST_HIGH_THRESHOLD_PCT) {
    flags.push({
      code: "merchant_cost_too_high",
      severity: "high",
      message: `Implied effective annualized merchant cost is ${effectiveAnnualCostPct.toFixed(1)}%, above the ${MERCHANT_COST_HIGH_THRESHOLD_PCT}% comfort threshold.`,
    });
  }

  if (revenue_volatility_pct >= VOLATILITY_HIGH_THRESHOLD_PCT) {
    flags.push({
      code: "high_revenue_volatility",
      severity: "watch",
      message: `Revenue volatility is ${revenue_volatility_pct}%, which raises the chance of missed or reduced monthly payments.`,
    });
  }

  if (monthsToCap !== null && term_months - monthsToCap <= 1) {
    flags.push({
      code: "thin_term_buffer",
      severity: "watch",
      message: "Cap is reached only at or near the end of the term, leaving little buffer for a revenue slowdown.",
    });
  }

  return flags;
}

// ---- Scenario record helpers, ported from the retired app/server/store.ts.
// A Busabase `scenarios` row stores only the analyst's raw input plus the
// decision -- `result` is never stored; it is always recomputed here via
// simulateScenario() so the board is fresh regardless of when a browser
// session loads it (mirrors kelly-behavior-predict's predicted_action
// normalization). ----

export const DECISION_ACTIONS = new Set(["approve_underwriting", "needs_revision", "reject"]);

export function emptyDecision() {
  return { action: null, note: "", decided_at: null };
}

export function newScenarioId() {
  return `scn_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`;
}

/**
 * Assemble the full scenario the UI renders, given the analyst's raw input.
 * `result` is always derived fresh from `input` -- never stored, never
 * passed in.
 */
export function buildScenario(name = "", input = {}, id = "") {
  const now = new Date().toISOString();
  return {
    id: id || newScenarioId(),
    name,
    created_at: now,
    updated_at: now,
    input,
    result: simulateScenario(input),
    decision: emptyDecision(),
  };
}

export function recomputeMetrics(scenarios = []) {
  const metrics = { total: 0, approved: 0, needs_revision: 0, rejected: 0, undecided: 0 };
  for (const scenario of scenarios) {
    metrics.total += 1;
    if (scenario.decision.action === "approve_underwriting") metrics.approved += 1;
    else if (scenario.decision.action === "needs_revision") metrics.needs_revision += 1;
    else if (scenario.decision.action === "reject") metrics.rejected += 1;
    else metrics.undecided += 1;
  }
  return metrics;
}

export function buildBatch(scenarios = [], { batchId = "busabase", generatedAt = new Date().toISOString() } = {}) {
  return {
    batch_id: batchId,
    generated_at: generatedAt,
    source: "kelly-revshare-simulator",
    mode: "app-in-skill",
    metrics: recomputeMetrics(scenarios),
    scenarios,
  };
}

// ---- Normalization: a Busabase `scenarios` row (already snake_cased by the
// provider) carries the raw input fields plus decision fields as flat
// strings/numbers. This assembles the nested Scenario shape the UI renders,
// recomputing `result` fresh every time. ----

export function normalizeScenarioRow({
  scenario_id = "",
  name = "",
  business_type = "",
  avg_monthly_revenue = 0,
  revenue_volatility_pct = 0,
  principal = 0,
  initial_share_rate_pct = 0,
  step_down_share_rate_pct = 0,
  repayment_cap_multiple = 1,
  term_months = 0,
  decision_action = "",
  decision_note = "",
  decided_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  const input = {
    business_type,
    avg_monthly_revenue: Number(avg_monthly_revenue) || 0,
    revenue_volatility_pct: Number(revenue_volatility_pct) || 0,
    principal: Number(principal) || 0,
    initial_share_rate_pct: Number(initial_share_rate_pct) || 0,
    step_down_share_rate_pct: Number(step_down_share_rate_pct) || 0,
    repayment_cap_multiple: Number(repayment_cap_multiple) || 1,
    term_months: Number(term_months) || 0,
  };
  return {
    id: scenario_id,
    name,
    created_at,
    updated_at,
    input,
    result: simulateScenario(input),
    decision: decision_action
      ? { action: decision_action, note: decision_note || "", decided_at: decided_at || null }
      : emptyDecision(),
  };
}

/** Flatten a Scenario back into the snake_case fields a Busabase row stores. */
export function scenarioToFields(scenario = {}) {
  const input = scenario.input || {};
  const decision = scenario.decision || emptyDecision();
  return {
    scenario_id: scenario.id,
    name: scenario.name || "",
    business_type: input.business_type || "",
    avg_monthly_revenue: input.avg_monthly_revenue ?? 0,
    revenue_volatility_pct: input.revenue_volatility_pct ?? 0,
    principal: input.principal ?? 0,
    initial_share_rate_pct: input.initial_share_rate_pct ?? 0,
    step_down_share_rate_pct: input.step_down_share_rate_pct ?? 0,
    repayment_cap_multiple: input.repayment_cap_multiple ?? 1,
    term_months: input.term_months ?? 0,
    decision_action: decision.action || "",
    decision_note: decision.note || "",
    decided_at: decision.decided_at || "",
    created_at: scenario.created_at || new Date().toISOString(),
    updated_at: scenario.updated_at || new Date().toISOString(),
  };
}

// ---- Settings row helpers. The `settings` Base holds a single row keyed by
// record-id/kind = "config", ported from the retired local-file provider's
// summarizeConfig() defaults. ----

export const DEFAULT_POLICY = {
  max_effective_annual_cost_pct: 40,
  min_cap_multiple: 1.2,
  max_cap_multiple: 2.5,
  max_term_months: 36,
};

function parseJsonPayload(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

export function buildConfigSummary(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  const config = parseJsonPayload(configRow?.payload);
  return {
    config_path: configRow ? "busabase" : "",
    is_example: !configRow,
    base_currency: config.base_currency || "USD",
    data_provider: "busabase",
    underwriting_policy: { ...DEFAULT_POLICY, ...(config.underwriting_policy || {}) },
  };
}
