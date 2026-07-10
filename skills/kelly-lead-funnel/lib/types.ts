// Core domain types for the Deal Sourcing Funnel, shared by the server, the
// scoring/data-provider libs, and the seed/validate scripts.

export type Category = "food_beverage" | "retail_discretionary" | "services" | "healthcare" | "ecommerce" | "other";

export type LeadSource = "referral" | "inbound_web" | "outbound_sourcing" | "event" | "partner";

export type Stage = "new" | "data_verified" | "scored" | "term_sheet_ready" | "rejected";

export const STAGES: Stage[] = ["new", "data_verified", "scored", "term_sheet_ready", "rejected"];

export interface Note {
  id: string;
  text: string;
  author: string;
  created_at: string;
}

export interface StageChange {
  from: Stage | null;
  to: Stage;
  at: string;
  reason?: string;
}

export interface ScoreFactor {
  factor: string;
  weight: number;
  contribution: number;
  rationale: string;
}

export interface Lead {
  id: string;
  brand_name: string;
  category: Category;
  city: string;
  store_count: number;
  est_monthly_revenue: number;
  lead_source: LeadSource;
  data_verifiable: boolean;
  stage: Stage;
  score: number;
  score_breakdown: ScoreFactor[];
  suggested_action: string;
  rejection_reason?: string;
  notes: Note[];
  stage_history: StageChange[];
  created_at: string;
  updated_at: string;
}

export interface StageSummary {
  stage: Stage;
  count: number;
  conversion_from_new_pct: number;
}

export interface FunnelSummary {
  total: number;
  by_stage: StageSummary[];
  overall_conversion_pct: number;
  rejection_rate_pct: number;
}

// ---- Config (as read from config.local.json / config.example.json) ----

export interface ScoringCriteria {
  ideal_store_count_min?: number;
  ideal_store_count_max?: number;
  ideal_monthly_revenue_min?: number;
  ideal_monthly_revenue_max?: number;
  low_risk_categories?: string[];
  medium_risk_categories?: string[];
  higher_risk_categories?: string[];
  [key: string]: unknown;
}

export interface FundProfile {
  display_name?: string;
  product?: string;
  target_check_size?: string;
}

export interface Config {
  base_currency?: string;
  data_provider?: string;
  fund_profile?: FundProfile;
  scoring_criteria?: ScoringCriteria;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  base_currency: string;
  fund_profile: FundProfile;
  scoring_criteria: ScoringCriteria;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
