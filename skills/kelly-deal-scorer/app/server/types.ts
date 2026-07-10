// Core domain types shared across the kelly-deal-scorer server, lib, and scripts.
// This is a review-queue App-in-Skill: it never calls an LLM or external API to
// score a deal. Every candidate's composite score is plain, hand-recomputable
// arithmetic from lib/scoring.ts against the fields below.

export type Category = "F&B" | "Retail" | "Fitness" | "Education";

export type Status = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";

export type DecisionAction = "approve_term_sheet" | "send_back_for_data" | "reject";

export interface ScoreFactor {
  key: "stability" | "growth" | "category_risk" | "principal_ratio" | "track_record";
  label: string;
  raw_score: number; // 0-100, before weighting
  weight: number; // 0-1
  contribution: number; // raw_score * weight, rounded
  detail: string; // human-readable arithmetic trace for auditability
}

export interface ScoreBreakdown {
  composite_score: number; // 0-100, sum of contributions rounded
  factors: ScoreFactor[];
  suggested_share_rate: {
    min_pct: number;
    max_pct: number;
  };
}

export interface Decision {
  action: DecisionAction;
  comment?: string;
  decided_at?: string;
}

export interface Candidate {
  id: string;
  business_name: string;
  category: Category;
  city: string;
  requested_principal: number;
  monthly_revenue: number[]; // oldest -> newest, 6-12 entries
  red_flags: string[];
  status: Status;
  score: ScoreBreakdown;
  decision?: Decision;
}

export interface QueueMetrics {
  needs_review: number;
  approved: number;
  done: number;
  blocked: number;
}

export interface ScoreDistribution {
  high_confidence: number; // score >= high_confidence_min
  needs_review: number; // between needs_review_min and high_confidence_min
  low_confidence: number; // score < needs_review_min
  average_score: number;
}

export interface Batch {
  batch_id: string;
  generated_at: string;
  source: string;
  mode: string;
  metrics: QueueMetrics;
  distribution: ScoreDistribution;
  items: Candidate[];
}

// ---- Config (as it appears in store.ts) ----

export interface RubricWeights {
  stability: number;
  growth: number;
  category_risk: number;
  principal_ratio: number;
  track_record: number;
}

export interface DecisionThresholds {
  high_confidence_min: number;
  needs_review_min: number;
}

export interface RevenueShareRateConfig {
  base_min_pct: number;
  base_max_pct: number;
}

export interface Rubric {
  weights: RubricWeights;
  category_risk_tier: Record<string, number>;
  decision_thresholds: DecisionThresholds;
  revenue_share_rate: RevenueShareRateConfig;
}

export interface Config {
  base_currency?: string;
  data_provider?: string;
  rubric?: Rubric;
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
  rubric: {
    weights: RubricWeights;
    decision_thresholds: DecisionThresholds;
  };
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
