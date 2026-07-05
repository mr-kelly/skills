// Core domain types shared across the kelly-audit server, scripts, and demo
// builder. These model the ACTUAL shapes produced by compute.ts / demo.ts /
// import_tables.ts / run_checks.ts and the snapshot validated by
// scripts/validate_ui_schema.ts. Derived fields (populated by deriveSnapshot)
// are optional so raw imported rows also satisfy the interfaces.

export type Severity = "info" | "low" | "medium" | "high";
export type DecisionAction = "approve" | "request_changes" | "revise" | "block" | "dismiss";

export interface Order {
  order_id: string;
  order_no: string;
  customer: string;
  order_date: string;
  amount: number;
  currency: string;
  source_file?: string;
  // Derived by deriveSnapshot:
  invoice_ids?: string[];
  payment_ids?: string[];
  anomaly_ids?: string[];
  invoice_status?: string;
  payment_status?: string;
}

export interface Invoice {
  invoice_id: string;
  invoice_no: string;
  order_no: string;
  customer: string;
  issue_date: string;
  due_date: string;
  amount: number;
  currency: string;
  kind?: string;
  notes?: string;
  source_file?: string;
  // Derived by deriveSnapshot:
  order_id?: string;
  payment_ids?: string[];
  anomaly_ids?: string[];
  paid_amount?: number;
  outstanding?: number;
  days_overdue?: number;
  status?: string;
}

export interface Payment {
  payment_id: string;
  payment_ref: string;
  invoice_no: string;
  order_no?: string;
  payer: string;
  paid_date: string;
  amount: number;
  currency: string;
  method?: string;
  source_file?: string;
  // Derived by deriveSnapshot:
  invoice_id?: string;
  order_id?: string;
  match_status?: string;
}

export interface Match {
  match_id: string;
  order_id: string;
  invoice_id: string;
  payment_id: string;
  rule: string;
  amount_delta: number;
}

export interface EvidenceRow {
  label: string;
  detail: string;
  amount: number;
  currency: string;
}

export interface Evidence {
  order_id?: string;
  invoice_id?: string;
  payment_ids?: string[];
  rows: EvidenceRow[];
  computed: string;
}

export interface Decision {
  action: string;
  note: string;
  draft: string | null;
  decided_at: string;
}

export interface Execution {
  status: string;
  operation: string;
  target: string;
  detail: string;
  executed_at: string;
}

export interface Anomaly {
  id: string;
  ref?: number;
  rule: string;
  severity: string;
  status?: string;
  title: string;
  customer: string;
  amount_at_stake: number;
  currency: string;
  aging_bucket?: string;
  reason: string;
  evidence: Evidence;
  proposed_action: string;
  draft: string;
  agent_notes?: string;
  created_at?: string;
  resolved_at?: string;
  decision?: Decision | null;
  execution?: Execution | null;
}

export interface AgingBucket {
  bucket: string;
  amount: number;
}

export interface SnapshotMetrics {
  order_count: number;
  invoice_count: number;
  payment_count: number;
  matched_payment_count: number;
  matched_pct: number;
  anomaly_count: number;
  open_anomaly_count: number;
  at_stake_total: number;
  receivable_total: number;
  overdue_receivable_total: number;
  aging: AgingBucket[];
}

export interface ImportLogEntry {
  import_id: string;
  imported_at: string;
  files: Record<string, string>;
  added: Record<string, number>;
  updated: Record<string, number>;
  warnings: string[];
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  [key: string]: unknown;
}

export interface AuditSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  base_currency: string;
  fx_rates: Record<string, number>;
  company: { name: string; [key: string]: unknown };
  range: { start: string; end: string };
  metrics?: SnapshotMetrics;
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  matches: Match[];
  anomalies: Anomaly[];
  import_log: ImportLogEntry[];
  warnings: Warning[];
}

export interface Rules {
  days_to_invoice: number;
  amount_tolerance_pct: number;
  aging_buckets: number[];
  duplicate_window_days: number;
}

// ---- Decisions / agent tasks / execution report state files ----

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

export interface AgentTask {
  id: string;
  ref?: number;
  title: string;
  rule: string;
  type: string;
  note: string;
  requested_at: string;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: AgentTask[];
}

export interface ExecutionResult {
  id: string;
  ref?: number;
  title?: string;
  operation: string;
  target?: string;
  customer?: string;
  status: string;
  detail?: string;
}

export interface ExecutionReport {
  generated_at: string;
  dry_run?: boolean;
  source: string;
  results: ExecutionResult[];
}

// ---- Config ----

export interface Config {
  base_currency?: string;
  company?: { name?: string; contact_email?: string };
  rules?: Partial<Rules>;
  import?: Record<string, unknown>;
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
