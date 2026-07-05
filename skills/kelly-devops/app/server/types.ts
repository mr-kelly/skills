// Core domain types shared across the kelly-devops server, store, and scripts.
// These model the ACTUAL shapes produced by demo.ts / store.ts and the ops
// snapshot validated by scripts/validate_ui_schema.ts.

export type ServiceStatus = "up" | "degraded" | "down" | "unknown";
export type ExpiryType = "domain" | "ssl_cert" | "api_key_rotation" | "plan_renewal";
export type ActionType = "renew_domain" | "rotate_key" | "investigate_spend" | "restart_service" | "ack_incident";
export type ActionStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type EventSeverity = "info" | "warning" | "error";
export type Verdict = "approve" | "request_changes" | "block" | "note";

// ---- Snapshot sub-shapes ----

export interface SslCert {
  issuer: string;
  valid_to: string;
  days_left: number;
}

export interface HistoryEntry {
  at: string;
  status: string;
  latency_ms: number;
  http_status?: number;
}

export interface ServiceMeta {
  http_status?: number;
  server?: string;
  note?: string;
}

export interface Service {
  service_id: string;
  name: string;
  product?: string;
  url: string;
  status: ServiceStatus | string;
  latency_ms: number;
  uptime_7d: number;
  ssl?: SslCert | null;
  last_check_at?: string;
  history: HistoryEntry[];
  meta?: ServiceMeta;
  warnings: string[];
}

export interface Expiry {
  expiry_id: string;
  type: ExpiryType | string;
  item: string;
  product?: string;
  expires_on?: string;
  days_left: number;
  auto_renew: boolean;
  action_id?: string;
  source?: string;
  registrar?: string;
  detail?: string;
}

// Alias for the domain-typed expiry rows filtered out of expiries[].
export type Domain = Expiry;

export interface SpendProvider {
  provider_id: string;
  name: string;
  currency: string;
  mtd: number;
  last_month: number;
  delta_pct: number;
  anomaly: boolean;
  action_id?: string;
  note?: string;
}

export interface SpendProduct {
  product_id: string;
  product: string;
  currency: string;
  mtd: number;
  last_month: number;
  share_pct: number;
}

export interface Spend {
  currency: string;
  providers: SpendProvider[];
  products: SpendProduct[];
}

export interface Decision {
  action_id?: string;
  verdict: Verdict | string;
  note: string;
  decided_at: string;
}

export interface ActionTarget {
  kind?: string;
  id?: string;
  registrar?: string;
  provider?: string;
  host?: string;
  service_id?: string;
  [key: string]: unknown;
}

export interface OpsAction {
  action_id: string;
  ref: number;
  type: ActionType | string;
  title: string;
  status: ActionStatus | string;
  reason: string;
  evidence: string[];
  plan: string[];
  target: ActionTarget;
  note: string;
  created_at?: string;
  decision: Decision | null;
}

export interface OpsEvent {
  event_id: string;
  at: string;
  severity: EventSeverity | string;
  kind: string;
  message: string;
  service_id?: string;
}

export interface SnapshotWarning {
  id: string;
  severity: string;
  message: string;
  service_id?: string;
  detail?: string;
}

export interface SnapshotChecks {
  services_checked_at?: string;
  domains_checked_at?: string;
  spend_ingested_at?: string;
}

export interface Metrics {
  services_total: number;
  services_up: number;
  services_degraded: number;
  services_down: number;
  certs_ok: number;
  certs_expiring: number;
  domains_ok: number;
  domains_expiring: number;
  expiring_14d: number;
  actions_needing_review: number;
  spend_mtd: number;
  spend_last_month: number;
  spend_anomalies: number;
}

export interface DevopsSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  currency: string;
  checks: SnapshotChecks;
  metrics: Metrics;
  services: Service[];
  expiries: Expiry[];
  spend: Spend;
  actions: OpsAction[];
  events: OpsEvent[];
  warnings: SnapshotWarning[];
}

// ---- Config (as it appears in store.ts / config.example.json) ----

export interface Thresholds {
  expiry_warning_days?: number;
  expiry_critical_days?: number;
  degraded_latency_ms?: number;
  spend_anomaly_pct?: number;
  [key: string]: number | undefined;
}

export interface ConfigProduct {
  product_id?: string;
  name?: string;
}

export interface ConfigService {
  service_id?: string;
  name?: string;
  product?: string;
  url?: string;
}

export interface ConfigDomain {
  domain?: string;
  product?: string;
  registrar?: string;
  auto_renew?: boolean;
}

export interface ConfigKeyRotation {
  key_id?: string;
  name?: string;
  env?: string;
  product?: string;
  rotate_every_days?: number;
  last_rotated_on?: string;
}

export interface ConfigBillingSource {
  provider_id?: string;
  name?: string;
  api_key_env?: string;
  token_env?: string;
  client_secret_env?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  currency?: string;
  thresholds?: Thresholds;
  products?: ConfigProduct[];
  services?: ConfigService[];
  domains?: ConfigDomain[];
  key_rotation?: ConfigKeyRotation[];
  billing_sources?: ConfigBillingSource[];
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
  thresholds: Thresholds | Record<string, never>;
  products: Array<{ product_id: string; name: string }>;
  services: Array<{ service_id: string; name: string; product: string; url: string }>;
  domains: Array<{ domain: string; product: string; registrar: string; auto_renew: boolean }>;
  key_rotation: Array<{ key_id: string; name: string; env: string; rotate_every_days: number; env_ready: boolean }>;
  billing_sources: Array<{ provider_id: string; name: string; secret_envs: string[]; secrets_ready: boolean }>;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Lock {
  owner: string;
  message?: string;
  started_at?: string;
}

export interface DecisionsFile {
  decisions: Record<string, Decision>;
  updated_at?: string;
}
