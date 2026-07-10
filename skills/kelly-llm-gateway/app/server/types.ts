// Core domain types shared across the kelly-llm-gateway server, provider, and
// scripts. These model a generic, brand-free LLM-gateway cost & governance
// dashboard: many internal services routed through one shared gateway to a mix
// of internal/external models. No real company/product names appear anywhere.

export type ProviderTier = "internal" | "external";
export type RouteStatus = "stable" | "canary" | "rollback" | "hold";
export type AnomalyKind = "cost_spike" | "error_spike";
export type Severity = "info" | "watch" | "high";
export type RolloutAction = "promote" | "rollback" | "hold";

export interface Service {
  service_id: string;
  display_name: string;
  team: string;
}

export interface Model {
  model_id: string;
  display_name: string;
  provider: string;
  tier: ProviderTier;
}

export interface DailyMetric {
  date: string; // ISO date, YYYY-MM-DD
  calls: number;
  cost: number;
  errors: number;
}

export interface Route {
  route_id: string;
  service_id: string;
  model_id: string;
  status: RouteStatus;
  canary_pct: number;
  rollback_ready: boolean;
  note?: string;
  daily: DailyMetric[]; // ascending by date, last entry is "today"
  calls_today: number;
  cost_today: number;
  error_rate_today: number;
  cost_baseline: number;
  error_rate_baseline: number;
}

export interface Totals {
  calls_today: number;
  cost_today: number;
  cost_7d_avg: number;
  error_rate_today: number;
}

export interface SpendTrendPoint {
  date: string;
  cost: number;
}

export interface Anomaly {
  id: string;
  route_id: string;
  kind: AnomalyKind;
  severity: Severity;
  baseline: number;
  actual: number;
  delta_pct: number;
  status: "open" | "acknowledged";
  acknowledged_at?: string;
  ack_note?: string;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  route_id?: string;
  detail?: string;
}

export interface GatewaySnapshot {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  source: string;
  base_currency: string;
  services: Service[];
  models: Model[];
  routes: Route[];
  totals: Totals;
  spend_trend: SpendTrendPoint[];
  anomalies: Anomaly[];
  warnings: Warning[];
}

// ---- Decisions / handoff (app/.data/decisions.json) ----

export interface RolloutDecision {
  route_id: string;
  action: RolloutAction;
  note: string;
  decided_at: string;
}

export interface AnomalyAck {
  anomaly_id: string;
  note: string;
  acknowledged_at: string;
}

export interface Decisions {
  rollouts: Record<string, RolloutDecision>;
  anomaly_acks: Record<string, AnomalyAck>;
}

// ---- Config ----

export interface GatewayConfig {
  region?: string;
  base_url?: string;
  api_key_env?: string;
}

export interface Config {
  base_currency?: string;
  data_provider?: string;
  cost_spike_threshold_pct?: number;
  error_spike_threshold_pct?: number;
  gateway?: GatewayConfig;
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
  gateway: {
    region: string;
    base_url: string;
    secret_envs: string[];
    secrets_ready: boolean;
  };
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
