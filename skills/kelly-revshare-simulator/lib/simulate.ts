// Pure, deterministic revenue-share-financing math. No fs, no network, no
// randomness — same input always produces the same output so the app, the
// seed script, and the validator all agree.
//
// Domain: a funder advances `principal` to an SME (retail/F&B chain store) in
// exchange for a percentage of monthly revenue ("revenue share") until a
// repayment cap multiple of the principal is reached, or the term ends. The
// share rate steps down once the principal itself has been recovered
// ("breakeven") — a common merchant-cash-advance / RBF structure.

export interface ScenarioInput {
  business_type: string;
  avg_monthly_revenue: number;
  revenue_volatility_pct: number;
  principal: number;
  initial_share_rate_pct: number;
  step_down_share_rate_pct: number;
  repayment_cap_multiple: number;
  term_months: number;
}

export interface MonthlyProjection {
  month: number;
  revenue: number;
  share_rate_pct: number;
  payment: number;
  cumulative_repayment: number;
  breakeven_reached: boolean;
  cap_reached: boolean;
}

export interface RiskFlag {
  code: "cap_not_reached" | "merchant_cost_too_high" | "high_revenue_volatility" | "thin_term_buffer";
  severity: "info" | "watch" | "high";
  message: string;
}

export interface ScenarioResult {
  monthly: MonthlyProjection[];
  total_repayment: number;
  cap_amount: number;
  months_to_breakeven: number | null;
  months_to_cap: number | null;
  cash_flow_payout_multiple: number | null;
  effective_annual_cost_pct: number | null;
  risk_flags: RiskFlag[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Project monthly revenue-share payments and cumulative repayment across the
 * contract term. Revenue is held flat at the scenario's average — volatility
 * is used only as a risk signal (see riskFlags), not as a stochastic driver,
 * to keep the projection deterministic.
 */
export function simulateScenario(input: ScenarioInput): ScenarioResult {
  const {
    avg_monthly_revenue,
    principal,
    initial_share_rate_pct,
    step_down_share_rate_pct,
    repayment_cap_multiple,
    term_months,
  } = input;

  const capAmount = round2(principal * repayment_cap_multiple);
  const monthly: MonthlyProjection[] = [];
  let cumulative = 0;
  let breakevenMonth: number | null = null;
  let capMonth: number | null = null;

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

  // Cash-Flow Payout Multiple: a P/E-like ratio — "price" is the principal
  // advanced, "earnings" is the annualized cash flow the merchant pays back.
  // Lower is "cheaper" for the funder (faster payback relative to cash flow).
  const annualizedRepaymentCashFlow = monthsElapsed > 0 ? (totalRepayment / monthsElapsed) * 12 : 0;
  const cashFlowPayoutMultiple =
    annualizedRepaymentCashFlow > 0 ? round2(principal / annualizedRepaymentCashFlow) : null;

  // Effective annualized merchant cost: the annualized growth rate implied by
  // paying back totalRepayment over monthsElapsed, expressed like an APR.
  let effectiveAnnualCostPct: number | null = null;
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

interface RiskContext {
  totalRepayment: number;
  capAmount: number;
  monthsToCap: number | null;
  effectiveAnnualCostPct: number | null;
}

const MERCHANT_COST_HIGH_THRESHOLD_PCT = 40;
const VOLATILITY_HIGH_THRESHOLD_PCT = 30;

/**
 * Deterministic, rule-based READ-ONLY risk flags — neutral observations for
 * an underwriter, never automated approve/reject decisions.
 */
export function computeRiskFlags(input: ScenarioInput, ctx: RiskContext): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (ctx.monthsToCap === null) {
    flags.push({
      code: "cap_not_reached",
      severity: "high",
      message: `Repayment cap (${ctx.capAmount.toFixed(0)}) is not reached within the ${input.term_months}-month term; total projected repayment is ${ctx.totalRepayment.toFixed(0)}.`,
    });
  }

  if (ctx.effectiveAnnualCostPct !== null && ctx.effectiveAnnualCostPct > MERCHANT_COST_HIGH_THRESHOLD_PCT) {
    flags.push({
      code: "merchant_cost_too_high",
      severity: "high",
      message: `Implied effective annualized merchant cost is ${ctx.effectiveAnnualCostPct.toFixed(1)}%, above the ${MERCHANT_COST_HIGH_THRESHOLD_PCT}% comfort threshold.`,
    });
  }

  if (input.revenue_volatility_pct >= VOLATILITY_HIGH_THRESHOLD_PCT) {
    flags.push({
      code: "high_revenue_volatility",
      severity: "watch",
      message: `Revenue volatility is ${input.revenue_volatility_pct}%, which raises the chance of missed or reduced monthly payments.`,
    });
  }

  if (ctx.monthsToCap !== null && input.term_months - ctx.monthsToCap <= 1) {
    flags.push({
      code: "thin_term_buffer",
      severity: "watch",
      message: "Cap is reached only at or near the end of the term, leaving little buffer for a revenue slowdown.",
    });
  }

  return flags;
}
