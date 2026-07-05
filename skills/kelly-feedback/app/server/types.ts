// Core domain types shared across the kelly-feedback server and scripts. These
// model the ACTUAL shapes produced by demo.ts / store.ts and the normalized
// snapshot in references/feedback-schema.md.

export type Channel = "email" | "discord" | "slack" | "x" | "appstore" | "survey" | "interview";
export type Sentiment = "positive" | "neutral" | "negative";
export type Triage = "new" | "clustered" | "ignored" | "insight";
export type RequestStatus = "candidate" | "roadmap" | "declined" | "needs_info";
export type ProposalStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type ProposalType = "promote_request" | "decline_request" | "merge_requests" | "publish_changelog";
export type Trend = "up" | "flat" | "down";
export type Lane = "now" | "next" | "later";

export interface FeedbackUser {
  handle?: string;
  plan?: string;
  tenure_months?: number;
  weight?: number;
}

export interface FeedbackItem {
  feedback_id: string;
  source_id: string;
  channel: Channel | string;
  product?: string;
  user: FeedbackUser;
  text: string;
  sentiment: Sentiment | string;
  received_at: string;
  permalink?: string;
  request_id?: string;
  triage: Triage | string;
  agent_note?: string;
}

export interface DecisionEvent {
  at: string;
  actor: string;
  action: string;
  note: string;
}

export interface FeedbackRequest {
  request_id: string;
  title: string;
  product?: string;
  status: RequestStatus | string;
  trend: Trend | string;
  frequency: number;
  weighted_score: number;
  problem_statement?: string;
  spec_summary?: string;
  effort_estimate?: string;
  representative_feedback_ids: string[];
  decision_history: DecisionEvent[];
  created_at: string;
  updated_at: string;
}

export interface RoadmapLaneItem {
  item_id: string;
  title: string;
  request_id?: string;
  note?: string;
}

export interface Roadmap {
  now: RoadmapLaneItem[];
  next: RoadmapLaneItem[];
  later: RoadmapLaneItem[];
}

export interface Proposal {
  proposal_id: string;
  ref: number;
  type: ProposalType | string;
  title: string;
  status: ProposalStatus | string;
  request_id?: string;
  request_ids?: string[];
  target_lane?: string;
  reason?: string;
  evidence?: string;
  draft_kind?: string;
  draft?: string;
  review_note?: string;
  created_at?: string;
  decided_at?: string;
}

export interface Metrics {
  feedback_count: number;
  new_feedback: number;
  request_count: number;
  proposals_needs_review: number;
  requests_needs_info: number;
  week_inflow?: Record<string, number>;
  sentiment?: Record<string, number>;
}

export interface SyncLogEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
  count: number;
}

export interface Product {
  product_id: string;
  display_name: string;
  tagline?: string;
}

export interface Source {
  source_id: string;
  channel: Channel | string;
  name: string;
  collection?: string;
  [key: string]: unknown;
}

export interface FeedbackSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  products: Product[];
  sources: Source[];
  feedback: FeedbackItem[];
  requests: FeedbackRequest[];
  roadmap: Roadmap;
  proposals: Proposal[];
  metrics: Metrics;
  sync_log: SyncLogEntry[];
}

export interface Decisions {
  schema_version: string;
  updated_at: string;
  proposals: Record<string, unknown>;
  feedback: Record<string, unknown>;
  requests: Record<string, unknown>;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

// ---- Config (as it appears in store.ts) ----

export interface Config {
  products?: Product[];
  sources?: Source[];
  scoring?: Record<string, unknown>;
  roadmap?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

// Query object as received from the request layer for demo detection.
export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}
