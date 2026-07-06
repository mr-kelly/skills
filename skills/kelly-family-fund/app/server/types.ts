// Core domain interfaces for the Kelly Family Fund pooled-pension ledger.
// Erasable-only TypeScript (native Node type-stripping): types/interfaces and
// union string literals only — no enums, namespaces, or runtime constructs.

export type Category = "care" | "transport" | "meal" | "gift" | "renqing" | "medical" | "misc";

export type Severity = "info" | "watch" | "high";

export interface FundMeta {
  name: string;
  steward: string;
  note?: string;
}

/** An elder whose pension is pooled into the fund. */
export interface Beneficiary {
  id: string;
  name: string;
  relation: string;
  pension_monthly: number;
}

/** A sibling family that shares in the surplus. */
export interface Family {
  id: string;
  name: string;
  head: string;
  members_count: number;
  note?: string;
}

/** A pension inflow for a given month. */
export interface IncomeInput {
  id: string;
  month: string;
  beneficiary_id: string;
  amount: number;
  note?: string;
}

export type Income = IncomeInput;

/** A fund expense. `care` rows are the parents' cost (family_id null, shared false). */
export interface ExpenseInput {
  id: string;
  month: string;
  date?: string;
  category: Category | string;
  amount: number;
  payee?: string;
  occasion?: string;
  family_id?: string | null;
  shared?: boolean;
  note?: string;
}

export type Expense = ExpenseInput;

export interface MonthRollup {
  month: string;
  income_total: number;
  expense_total: number;
  net: number;
  balance_end: number;
}

export interface Totals {
  income_total: number;
  expense_total: number;
  balance: number;
  care_total: number;
  family_total: number;
  avg_family_benefit: number;
}

export interface CategoryRollup {
  category: string;
  amount: number;
  pct: number;
}

export interface FamilyRollup {
  family_id: string;
  name: string;
  benefit_total: number;
  share_pct: number;
  deviation_pct: number;
}

export interface Insight {
  id: string;
  code: string;
  severity: Severity;
  category: string;
  params: Record<string, unknown>;
}

export interface FundSnapshot {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  base_currency: string;
  fund: FundMeta;
  beneficiaries: Beneficiary[];
  families: Family[];
  income: Income[];
  expenses: Expense[];
  months: MonthRollup[];
  totals: Totals;
  by_category: CategoryRollup[];
  by_family: FamilyRollup[];
  insights?: Insight[];
}

export interface FairnessConfig {
  deviation_threshold_pct?: number;
}

/** Busabase connection block (config.busabase); env vars override these. */
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  data_provider?: string;
  base_currency?: string;
  fund?: Partial<FundMeta>;
  beneficiaries?: Beneficiary[];
  families?: Family[];
  fairness?: FairnessConfig;
  busabase?: BusabaseConfig;
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
  fund: FundMeta;
  beneficiaries: Beneficiary[];
  families: Array<{ id: string; name: string; head: string; members_count: number }>;
  deviation_threshold_pct: number;
}

export interface BuildSnapshotInput {
  snapshot_id?: string;
  generated_at?: string;
  base_currency?: string;
  fund?: FundMeta;
  beneficiaries?: Beneficiary[];
  families?: Family[];
  income?: IncomeInput[];
  expenses?: ExpenseInput[];
  source?: string;
}
