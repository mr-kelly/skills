// Core domain types shared across the kelly-money server, provider, and scripts.
// These model the ACTUAL shapes produced by demo.ts / the data-provider layer and
// the normalized ledger snapshot validated by scripts/validate_ui_schema.ts.
// lib/types.ts re-exports these domain shapes for the provider layer and scripts.

export type Direction = "in" | "out";
export type InvoiceDirection = "incoming" | "outgoing";
export type Severity = "info" | "warning" | "high";

export interface AccountBalance {
  available: number;
  pending: number;
  current: number;
  as_of?: string;
}

export interface AccountTotals {
  gross_inflow: number;
  gross_outflow: number;
  fees: number;
  net: number;
}

export interface Account {
  account_id: string;
  provider: string;
  display_name: string;
  entity: string;
  currency: string;
  status: string;
  balance: AccountBalance;
  totals: AccountTotals;
  last_sync_at: string;
  provider_account_id: string;
}

export interface Transaction {
  transaction_id: string;
  provider: string;
  account_id: string;
  provider_account_id: string;
  provider_transaction_id: string;
  occurred_at: string;
  available_at: string | null;
  description: string;
  counterparty: string;
  type: string;
  status: string;
  currency: string;
  gross: number;
  fee: number;
  net: number;
  direction: Direction;
  source_url: string;
  tags: string[];
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  direction: InvoiceDirection;
  vendor: string;
  customer: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  source: string;
  source_url: string;
  file_path: string;
  notes: string;
}

export interface AuditEvent {
  event: string;
  actor: string;
  at: string;
  note: string;
}

export interface InvoiceMatch {
  match_id: string;
  invoice_id: string;
  transaction_id: string;
  status: string;
  amount_delta: number;
  date_delta_days: number;
  confidence: number;
  matching_method: string;
  matching_rule: string;
  review_status: string;
  amount_tolerance: number;
  date_tolerance_days: number;
  candidate_transaction_ids: string[];
  matched_at: string;
  audit_events: AuditEvent[];
  notes: string[];
}

export interface SnapshotMetrics {
  account_count: number;
  transaction_count: number;
  gross_inflow: number;
  gross_outflow: number;
  fees: number;
  net: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  account_id?: string;
  detail?: string;
}

export interface LedgerSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  base_currency: string;
  range: { start: string; end: string };
  metrics: SnapshotMetrics;
  accounts: Account[];
  transactions: Transaction[];
  invoices: Invoice[];
  invoice_matches: InvoiceMatch[];
  warnings: Warning[];
}

// ---- Config (as resolved by the data-provider layer) ----

export interface ConfigAccount {
  account_id?: string;
  provider?: string;
  display_name?: string;
  entity?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface Config {
  accounts?: ConfigAccount[];
  data_provider?: string;
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
