// Domain shapes for the RBF Portfolio Health Dashboard. A "contract" is one
// revenue-share advance to one SME (small/medium enterprise) — generic, not
// tied to any specific real company or fund.

export type ContractStatus = "active" | "completed" | "delinquent";

export interface Contract {
  id: string;
  business_name: string;
  category: string;
  city: string;
  origination_date: string;
  months_since_origination: number;
  expected_term_months: number;
  funding_amount: number;
  cap_multiple: number;
  cap_amount: number;
  cumulative_repayment: number;
  monthly_revenue: number[];
  status: ContractStatus;
  currency: string;
}

export interface Totals {
  total_aum: number;
  total_collected: number;
  weighted_avg_progress_pct: number;
  at_risk_count: number;
  active_count: number;
  contract_count: number;
}

export interface ProgressRow {
  id: string;
  business_name: string;
  category: string;
  expected_pct: number;
  actual_pct: number;
  lag_pp: number;
  severity: "ok" | "watch" | "high";
}

export interface ConcentrationSlice {
  key: string;
  funding_amount: number;
  weight_pct: number;
  contract_count: number;
}

export interface WatchlistRow {
  id: string;
  business_name: string;
  category: string;
  city: string;
  decline_pct: number;
  recent_revenue: number;
  monthly_revenue: number[];
}

export interface Insights {
  totals: Totals;
  progress: ProgressRow[];
  concentration_by_category: ConcentrationSlice[];
  concentration_by_city: ConcentrationSlice[];
  watchlist: WatchlistRow[];
}

export interface PortfolioSnapshot {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  source: string;
  base_currency: string;
  fund_name: string;
  contracts: Contract[];
  insights?: Insights;
}

export interface FlagDecision {
  flagged: boolean;
  note: string;
  updated_at: string;
}

export type DecisionsMap = Record<string, FlagDecision>;

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  base_currency: string;
  fund_name: string;
  risk_policy: {
    lag_watch_pp: number;
    lag_high_pp: number;
    revenue_decline_pct: number;
  };
}
