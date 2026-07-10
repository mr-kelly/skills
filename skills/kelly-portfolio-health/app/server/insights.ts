import { round2 } from "../../lib/common.ts";
import type { ConcentrationSlice, Contract, Insights, ProgressRow, Totals, WatchlistRow } from "./types.ts";

export const DEFAULT_RISK_POLICY = {
  lag_watch_pp: 15,
  lag_high_pp: 25,
  revenue_decline_pct: 10,
};

export type RiskPolicy = typeof DEFAULT_RISK_POLICY;

// Pure, deterministic read-only insights over a contract list. No storage
// access here — same function is used by the live snapshot path and the
// ?demo= payload so the UI behaves identically either way.
export function computeInsights(contracts: Contract[], riskPolicy: RiskPolicy = DEFAULT_RISK_POLICY): Insights {
  const active = contracts.filter((c) => c.status !== "completed");

  const progress: ProgressRow[] = contracts.map((c) => {
    const expected_pct = round2(
      Math.min(100, (c.months_since_origination / Math.max(1, c.expected_term_months)) * 100),
    );
    const actual_pct = round2(c.cap_amount ? (c.cumulative_repayment / c.cap_amount) * 100 : 0);
    const lag_pp = round2(expected_pct - actual_pct);
    const severity: ProgressRow["severity"] =
      lag_pp >= riskPolicy.lag_high_pp ? "high" : lag_pp >= riskPolicy.lag_watch_pp ? "watch" : "ok";
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
  const atRiskCount =
    progress.filter((row) => row.severity !== "ok").length + contracts.filter((c) => c.status === "delinquent").length;

  const totals: Totals = {
    total_aum: totalAum,
    total_collected: totalCollected,
    weighted_avg_progress_pct: weightedAvgProgress,
    at_risk_count: atRiskCount,
    active_count: active.length,
    contract_count: contracts.length,
  };

  const concentration_by_category = concentrationBy(contracts, (c) => c.category, totalAumForConcentration(contracts));
  const concentration_by_city = concentrationBy(contracts, (c) => c.city, totalAumForConcentration(contracts)).slice(
    0,
    8,
  );

  const watchlist: WatchlistRow[] = contracts
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
      } as WatchlistRow;
    })
    .filter((row): row is WatchlistRow => row !== null)
    .sort((a, b) => a.decline_pct - b.decline_pct);

  return { totals, progress, concentration_by_category, concentration_by_city, watchlist };
}

function totalAumForConcentration(contracts: Contract[]): number {
  return contracts.reduce((sum, c) => sum + c.funding_amount, 0);
}

function concentrationBy(contracts: Contract[], keyFn: (c: Contract) => string, total: number): ConcentrationSlice[] {
  const map = new Map<string, { funding_amount: number; contract_count: number }>();
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
