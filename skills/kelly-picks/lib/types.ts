// Core domain types shared across the kelly-picks data-provider layer, server,
// scripts, and demo builder. These model the ACTUAL shapes produced by the
// providers / decisions.ts / demo.ts and the scripts (compute_margins /
// ingest_trends / execute_decisions), plus the snapshot validated by
// scripts/validate_ui_schema.ts. Fields the agent pipeline fills in
// progressively are optional.

export type DecisionKind = "candidate" | "proposal" | "trend";

export interface MarginCard {
  price?: number;
  cogs?: number;
  freight?: number;
  freight_quoted?: boolean;
  platform_fee_pct?: number;
  platform_fee?: number;
  ad_cost?: number;
  margin?: number;
  margin_pct?: number;
  breakeven_acos_pct?: number;
  below_floor?: boolean;
  computed_at?: string;
  [key: string]: unknown;
}

export interface Source {
  source_id: string;
  kind: string;
  name: string;
  method: string;
  last_sweep_at?: string;
  items_7d?: number;
  status?: string;
  [key: string]: unknown;
}

export interface TrendItem {
  trend_id: string;
  source: string;
  title: string;
  summary?: string;
  url?: string;
  external_id?: string;
  candidate_id?: string;
  content_hash?: string;
  metric_label?: string;
  metric_value?: number;
  delta_pct?: number;
  momentum?: number[];
  observed_at?: string;
  promotion?: Decision;
  [key: string]: unknown;
}

export interface Candidate {
  candidate_id: string;
  name: string;
  source?: string;
  category?: string;
  platform_id?: string;
  stage?: string;
  est_price?: number;
  momentum_pct?: number;
  competition?: Record<string, unknown>;
  evidence?: unknown[];
  why_it_matters?: string;
  first_seen?: string;
  last_updated?: string;
  margin_card?: MarginCard;
  verdict?: Decision;
  [key: string]: unknown;
}

export interface Proposal {
  proposal_id: string;
  candidate_id: string;
  status?: string;
  brief?: string;
  reason?: string;
  verdict?: string;
  review?: Decision;
  [key: string]: unknown;
}

export interface SyncLogEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface SnapshotMetrics {
  source_count: number;
  trend_item_count: number;
  candidate_count: number;
  candidates_new_7d: number;
  candidates_to_review: number;
  in_development: number;
  watching: number;
  dropped: number;
  proposals_needs_review: number;
  avg_margin_approved_pct: number;
  below_margin_floor: number;
}

export interface PicksSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  demo_scenario?: string;
  base_currency: string;
  range: { start: string; end: string };
  metrics: SnapshotMetrics;
  sources: Source[];
  trend_items: TrendItem[];
  candidates: Candidate[];
  proposals: Proposal[];
  sync_log: SyncLogEntry[];
}

// ---- Decisions / agent tasks state files ----

export interface Decision {
  kind: string;
  action: string;
  comment: string;
  decided_at: string;
  stage?: string;
  status?: string;
  brief?: string;
  [key: string]: unknown;
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

export interface AgentTask {
  task_id: string;
  status: string;
  kind: string;
  ref_id: string;
  note: string;
  created_at: string;
  [key: string]: unknown;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: AgentTask[];
}

export interface DecisionBody {
  id?: string;
  kind?: string;
  action?: string;
  comment?: string;
  brief?: string;
  [key: string]: unknown;
}

// ---- Config ----

export interface Platform {
  platform_id?: string;
  name?: string;
  currency?: string;
  referral_fee_pct?: number;
  fulfillment_flat?: number;
  [key: string]: unknown;
}

export interface FreightRule {
  category?: string;
  per_unit?: number;
  [key: string]: unknown;
}

export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  sources?: Array<Record<string, unknown>>;
  platforms?: Platform[];
  seller_profile?: Record<string, unknown>;
  freight?: { default_per_unit?: number; rules?: FreightRule[]; [key: string]: unknown };
  ad_cost_default_pct?: number;
  data_provider?: string;
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export interface LockInfo {
  owner?: string;
  message?: string;
  started_at?: string;
}

// Result of loadConfig()/readConfig(); passed to the providers so they can
// surface a sanitized config summary in /api/state.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}
