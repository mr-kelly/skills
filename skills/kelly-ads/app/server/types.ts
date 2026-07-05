// Core domain types shared across the kelly-ads server, scripts, and demo data.
// These model the ACTUAL shapes produced by demo.ts / store.ts / the ingest and
// check scripts and the normalized snapshot in references/ads-schema.md.

export type PlatformId = "amazon" | "meta" | "tiktok" | "google";
export type CampaignStatus = "active" | "paused" | "rejected";
export type Severity = "critical" | "warning" | "info";
export type AnomalyType = "acos_breach" | "budget_exhausted" | "zero_conversion_spend" | "cpc_spike" | "rejected";
export type AnomalyState = "open" | "actioned" | "dismissed" | "resolved";
export type AdjustmentType =
  | "negative_keyword"
  | "bid_down"
  | "bid_up"
  | "pause_target"
  | "budget_shift"
  | "creative_refresh";
export type AdjustmentStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type Verdict = "approve" | "request_changes" | "block" | "note";

export interface DailyPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface CampaignTarget {
  target_id: string;
  type: string;
  text: string;
  match_type?: string;
  state: string;
  spend_14d: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cpc?: number;
  acos_pct?: number;
}

export interface CampaignTotals {
  spend: number;
  impressions?: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number;
  acos_pct: number;
  cpc?: number;
}

export interface Campaign {
  campaign_id: string;
  platform: string;
  name: string;
  product?: string;
  sku?: string;
  status: string;
  daily_budget: number;
  budget_spent_today_pct: number;
  acos_target_pct: number;
  currency: string;
  daily: DailyPoint[];
  targets: CampaignTarget[];
  totals_7d?: CampaignTotals;
  trend?: string;
  last_sync_at?: string;
  [key: string]: unknown;
}

export interface Platform {
  platform_id: string;
  name: string;
  status: string;
  account_id?: string;
  campaign_count?: number;
  spend_14d?: number;
  revenue_14d?: number;
  conversions_14d?: number;
  roas?: number;
  acos_pct?: number;
  [key: string]: unknown;
}

export interface Anomaly {
  anomaly_id: string;
  type: string;
  severity: string;
  state: string;
  campaign_id: string;
  platform: string;
  evidence: string;
  detected_at?: string;
  first_seen_at?: string;
  adjustment_id?: string;
  [key: string]: unknown;
}

export interface AdjustmentDecision {
  adjustment_id: string;
  verdict: Verdict;
  note: string;
  decided_at: string;
}

export interface Adjustment {
  adjustment_id: string;
  type: string;
  title: string;
  status: string;
  campaign_id: string;
  platform: string;
  reason?: string;
  current_value?: string;
  proposed_value?: string;
  ref?: number;
  evidence?: unknown[];
  target?: Record<string, unknown>;
  decision?: AdjustmentDecision;
  execution?: Record<string, unknown>;
  note?: string;
  [key: string]: unknown;
}

export interface SyncLogEntry {
  sync_id: string;
  at: string;
  kind: string;
  message: string;
  [key: string]: unknown;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  [key: string]: unknown;
}

export interface SnapshotMetrics {
  spend_mtd: number;
  spend_last_month?: number;
  revenue_mtd: number;
  spend_14d: number;
  revenue_14d: number;
  blended_roas: number;
  blended_acos_pct: number;
  acos_target_pct: number;
  conversions_14d: number;
  campaigns_total: number;
  campaigns_active: number;
  anomalies_open: number;
  anomalies_critical: number;
  adjustments_needing_review: number;
  budget_at_risk_today: number;
  [key: string]: unknown;
}

export interface AdsSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  currency: string;
  range: { start: string; end: string };
  targets: Record<string, number>;
  metrics: SnapshotMetrics;
  platforms: Platform[];
  campaigns: Campaign[];
  anomalies: Anomaly[];
  adjustments: Adjustment[];
  sync_log: SyncLogEntry[];
  warnings: Warning[];
  [key: string]: unknown;
}

// ---- Config ----

export interface ConfigPlatform {
  platform_id?: string;
  name?: string;
  account_id?: string;
  [key: string]: unknown;
}

export interface Config {
  currency?: string;
  data_provider?: string;
  targets?: Record<string, number>;
  thresholds?: Record<string, number>;
  platforms?: ConfigPlatform[];
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummaryPlatform {
  platform_id: string;
  name: string;
  account_id: string;
  secret_envs: string[];
  secrets_ready: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  currency: string;
  targets: Record<string, number>;
  thresholds: Record<string, number>;
  platforms: ConfigSummaryPlatform[];
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Lock {
  owner?: string;
  message?: string;
  started_at?: string;
}

export interface DecisionsFile {
  decisions: Record<string, AdjustmentDecision>;
  updated_at?: string;
}

export interface DecisionInput {
  adjustment_id?: string;
  verdict?: string;
  note?: string;
}
