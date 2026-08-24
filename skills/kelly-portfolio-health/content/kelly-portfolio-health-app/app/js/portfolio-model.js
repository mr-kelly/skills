// Domain model for Kelly Portfolio Health: a revenue-based-financing (RBF) /
// private-credit book of many small SME (small/medium enterprise) contracts.
// Ported verbatim (same variable names, same order of operations, only TS
// types stripped) from the retired app/server/insights.ts
// (computeInsights/concentrationBy) and lib/common.ts (round2). Read this
// file before changing repayment-lag, concentration, or watchlist detection
// behavior.
//
// Architectural change from the retired local-file shape: the human "flag
// for review" / "clear flag" / note action is written directly onto the
// contract's own Busabase record (flagged/note/decision_updated_at) instead
// of a separate decisions.json handoff file — the same "reads are always
// live, no separate decisions bucket" simplification used across this batch
// of conversions.

export function round2(value = 0) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export const DEFAULT_RISK_POLICY = {
  lag_watch_pp: 15,
  lag_high_pp: 25,
  revenue_decline_pct: 10,
};

// ---- app/server/insights.ts's computeInsights/concentrationBy, ported
// verbatim ----

export function computeInsights(contracts = [], riskPolicy = DEFAULT_RISK_POLICY) {
  const active = contracts.filter((c) => c.status !== "completed");

  const progress = contracts.map((c) => {
    const expected_pct = round2(
      Math.min(100, (c.months_since_origination / Math.max(1, c.expected_term_months)) * 100),
    );
    const actual_pct = round2(c.cap_amount ? (c.cumulative_repayment / c.cap_amount) * 100 : 0);
    const lag_pp = round2(expected_pct - actual_pct);
    const severity = lag_pp >= riskPolicy.lag_high_pp ? "high" : lag_pp >= riskPolicy.lag_watch_pp ? "watch" : "ok";
    return {
      id: c.id,
      business_name: c.business_name,
      category: c.category,
      expected_pct,
      actual_pct,
      lag_pp,
      severity,
    };
  });

  const totalAum = round2(active.reduce((sum, c) => sum + c.funding_amount, 0));
  const totalCollected = round2(contracts.reduce((sum, c) => sum + c.cumulative_repayment, 0));
  const totalCap = active.reduce((sum, c) => sum + c.cap_amount, 0);
  const weightedRepayment = active.reduce((sum, c) => sum + c.cumulative_repayment, 0);
  const weightedAvgProgress = totalCap ? round2((weightedRepayment / totalCap) * 100) : 0;
  const atRiskIds = new Set();
  for (const row of progress) {
    if (row.severity !== "ok") atRiskIds.add(row.id);
  }
  for (const c of contracts) {
    if (c.status === "delinquent") atRiskIds.add(c.id);
  }
  const atRiskCount = atRiskIds.size;

  const totals = {
    total_aum: totalAum,
    total_collected: totalCollected,
    weighted_avg_progress_pct: weightedAvgProgress,
    at_risk_count: atRiskCount,
    active_count: active.length,
    contract_count: contracts.length,
  };

  // Use the same active-only total as headline "Total AUM" so concentration
  // percentages are genuinely "% of AUM" and consistent with the rest of the
  // dashboard (completed contracts are excluded from both).
  const concentration_by_category = concentrationBy(active, (c) => c.category, totalAum);
  const concentration_by_city = concentrationBy(active, (c) => c.city, totalAum).slice(0, 8);

  const watchlist = contracts
    .map((c) => {
      const history = c.monthly_revenue || [];
      if (history.length < 4) return null;
      const recent = history[history.length - 1];
      const baseline = history.slice(0, history.length - 1);
      const baselineAvg = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
      const decline_pct = baselineAvg ? round2(((recent - baselineAvg) / baselineAvg) * 100) : 0;
      if (decline_pct > -riskPolicy.revenue_decline_pct) return null;
      return {
        id: c.id,
        business_name: c.business_name,
        category: c.category,
        city: c.city,
        decline_pct,
        recent_revenue: recent,
        monthly_revenue: history,
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.decline_pct - b.decline_pct);

  return { totals, progress, concentration_by_category, concentration_by_city, watchlist };
}

function concentrationBy(contracts, keyFn, total) {
  const map = new Map();
  for (const c of contracts) {
    const key = keyFn(c);
    const entry = map.get(key) || { funding_amount: 0, contract_count: 0 };
    entry.funding_amount += c.funding_amount;
    entry.contract_count += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, entry]) => ({
      key,
      funding_amount: round2(entry.funding_amount),
      weight_pct: total ? round2((entry.funding_amount / total) * 100) : 0,
      contract_count: entry.contract_count,
    }))
    .sort((a, b) => b.funding_amount - a.funding_amount);
}

// ---- app/server/store.ts's riskPolicyFromConfig/summarizeConfig, ported in
// spirit; `payload` is the parsed Settings row's JSON ----

export function riskPolicyFromConfig(config = {}) {
  const policy = config?.risk_policy || {};
  return {
    lag_watch_pp: Number(policy.lag_watch_pp ?? DEFAULT_RISK_POLICY.lag_watch_pp),
    lag_high_pp: Number(policy.lag_high_pp ?? DEFAULT_RISK_POLICY.lag_high_pp),
    revenue_decline_pct: Number(policy.revenue_decline_pct ?? DEFAULT_RISK_POLICY.revenue_decline_pct),
  };
}

export function buildConfigSummary(payload = {}) {
  return {
    config_path: "busabase:base/kelly-portfolio-health-settings",
    is_example: false,
    base_currency: payload.base_currency || "USD",
    fund_name: payload.fund_name || "Sample RBF Fund",
    risk_policy: riskPolicyFromConfig(payload),
  };
}

// Builds the { schema_version, snapshot_id, generated_at, source,
// base_currency, fund_name, contracts, insights } shape app.js renders.
// Ported in spirit from attachInsights()/loadState() in the retired
// app/server/store.ts, now a pure function over already-read Busabase rows
// (or the demo book) instead of a local snapshot.json read.
export function buildSnapshot({
  contracts = [],
  configSummary: { base_currency = "USD", fund_name = "Sample RBF Fund", risk_policy = DEFAULT_RISK_POLICY } = {},
  generatedAt = new Date().toISOString(),
  source = "kelly-portfolio-health",
} = {}) {
  return {
    schema_version: "1",
    snapshot_id: `portfolio-${String(generatedAt).slice(0, 10)}`,
    generated_at: generatedAt,
    source,
    base_currency,
    fund_name,
    contracts,
    insights: computeInsights(contracts, risk_policy),
  };
}

// ---- Busabase row <-> domain object normalization ----

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function normalizeContractRow({
  contract_id = "",
  business_name = "",
  category = "",
  city = "",
  origination_date = "",
  months_since_origination = 0,
  expected_term_months = 0,
  funding_amount = 0,
  cap_multiple = 0,
  cap_amount = 0,
  cumulative_repayment = 0,
  monthly_revenue = "",
  status = "active",
  currency = "USD",
  flagged = "false",
  note = "",
  decision_updated_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    id: contract_id,
    business_name,
    category,
    city,
    origination_date,
    months_since_origination: Number(months_since_origination) || 0,
    expected_term_months: Number(expected_term_months) || 0,
    funding_amount: Number(funding_amount) || 0,
    cap_multiple: Number(cap_multiple) || 0,
    cap_amount: Number(cap_amount) || 0,
    cumulative_repayment: Number(cumulative_repayment) || 0,
    monthly_revenue: parseJsonValue(monthly_revenue, []),
    status,
    currency,
    flagged: String(flagged) === "true",
    note: note || "",
    decision_updated_at,
    __recordId,
    __headCommitId,
  };
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields). Every destructured parameter carries a default
// so checkJs never infers a required-but-absent property. Busabase has no
// boolean field type, so flagged is written as a "true"/"false" string.
export function baseContractFields({
  id = "",
  business_name = "",
  category = "",
  city = "",
  origination_date = "",
  months_since_origination = 0,
  expected_term_months = 0,
  funding_amount = 0,
  cap_multiple = 0,
  cap_amount = 0,
  cumulative_repayment = 0,
  monthly_revenue = [],
  status = "active",
  currency = "USD",
  flagged = false,
  note = "",
  decision_updated_at = "",
} = {}) {
  return {
    contract_id: id,
    business_name,
    category,
    city,
    origination_date,
    months_since_origination: Number(months_since_origination) || 0,
    expected_term_months: Number(expected_term_months) || 0,
    funding_amount: Number(funding_amount) || 0,
    cap_multiple: Number(cap_multiple) || 0,
    cap_amount: Number(cap_amount) || 0,
    cumulative_repayment: Number(cumulative_repayment) || 0,
    monthly_revenue: JSON.stringify(monthly_revenue || []),
    status,
    currency,
    flagged: flagged ? "true" : "false",
    note: note || "",
    decision_updated_at,
  };
}

// Ported from the retired local-file data provider's setDecision(): merges
// the flag/note patch onto the contract's current
// state and stamps decision_updated_at with "now". Now a pure function that
// produces the next full row (written directly onto the same Busabase
// record) instead of a decisions.json entry.
export function applyContractDecision(current = {}, patch = {}, now = new Date().toISOString()) {
  return {
    ...current,
    flagged: typeof patch.flagged === "boolean" ? patch.flagged : Boolean(current.flagged),
    note: typeof patch.note === "string" ? patch.note : current.note || "",
    decision_updated_at: now,
  };
}
