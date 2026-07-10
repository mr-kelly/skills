// Core domain types for the Predictive Recommendation Analytics Desk.
// Everything here models a GENERIC consumer booking-funnel product (travel /
// e-commerce style). No real company, brand, or live data is referenced.

export type FunnelStage = "browse" | "search" | "compare" | "booking_attempt" | "complete";

export const FUNNEL_STAGES: FunnelStage[] = ["browse", "search", "compare", "booking_attempt", "complete"];

export type NextAction =
  | "send_discount_offer"
  | "show_urgency_banner"
  | "recommend_similar_items"
  | "send_reminder_email"
  | "no_action_needed";

export const NEXT_ACTIONS: NextAction[] = [
  "send_discount_offer",
  "show_urgency_banner",
  "recommend_similar_items",
  "send_reminder_email",
  "no_action_needed",
];

export interface SegmentDefinition {
  id: string;
  name_key: string;
  description_key: string;
  // Baseline probability [0,1] of a session in this segment continuing past
  // each stage (index i = probability of moving from stage i to stage i+1).
  continuation_rates: number[];
  // Ranges used to synthesize deterministic per-session feature signals.
  session_length_range: [number, number]; // minutes
  cart_abandon_range: [number, number]; // count
  price_check_range: [number, number]; // count
  days_since_last_visit_range: [number, number];
  coupon_click_range: [number, number];
  session_count: number;
}

export interface SessionFeatures {
  session_id: string;
  segment_id: string;
  session_length: number;
  cart_abandon_count: number;
  price_check_count: number;
  days_since_last_visit: number;
  coupon_clicks: number;
  reached_stage: FunnelStage;
}

export interface RuleTrigger {
  code: string;
  description: string;
  matched: boolean;
}

export interface Prediction {
  action: NextAction;
  score: number;
  triggers: RuleTrigger[];
}

export interface SessionResult extends SessionFeatures {
  predicted_action: NextAction;
  actual_action: NextAction;
  triggers: RuleTrigger[];
}

export interface FunnelCounts {
  segment_id: string | "overall";
  stage_counts: Record<FunnelStage, number>;
  drop_off_pct: Partial<Record<FunnelStage, number>>;
}

export interface SegmentPredictionSummary {
  segment_id: string;
  dominant_action: NextAction;
  action_distribution: Record<NextAction, number>;
  sample_triggers: RuleTrigger[];
}

export interface ConfusionCell {
  action: NextAction;
  true_positive: number;
  false_positive: number;
  false_negative: number;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface BacktestSummary {
  segment_id: string | "overall";
  total: number;
  correct: number;
  accuracy: number;
  per_action: ConfusionCell[];
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
}

export type DecisionStatus = "trusted" | "needs_recalibration";

// Human review decision on one segment's prediction rule. All decisions for
// every segment live together in the single app/.data/decisions.json handoff
// file, keyed by segment_id (see lib/data-provider/local-file-provider.ts).
export interface Decision {
  status: DecisionStatus;
  note: string;
  decided_at: string;
}

export type DecisionsFile = Record<string, Decision>;

export interface OnboardingState {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
