// Core domain interfaces for the Kelly Family Office consolidation logic.
// Erasable-only TypeScript (native Node type-stripping): types/interfaces and
// union string literals only — no enums, namespaces, or runtime constructs.

export type EntityType = "INDIVIDUAL" | "TRUST" | "COMPANY" | "FUND" | "FOUNDATION";

export type AssetClass = "EQUITY" | "BOND" | "CASH" | "CRYPTO" | "REAL_ESTATE" | "PRIVATE_EQUITY" | "ALTERNATIVE";

export type Severity = "info" | "watch" | "high";

export interface Entity {
  entity_id: string;
  name: string;
  type: EntityType | string;
  member?: string;
}

export interface AccountRef {
  account_id: string;
  entity_id: string;
  institution: string;
  account_type?: string;
  currency: string;
  display_name?: string;
  as_of?: string;
}

/** Raw holding as supplied to buildSnapshot (base-currency fields optional). */
export interface HoldingInput {
  holding_id: string;
  entity_id?: string;
  account_id: string;
  symbol: string;
  name: string;
  asset_class: AssetClass | string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  currency?: string;
  as_of?: string;
}

/** Normalized holding as produced by normalizeHoldings/buildSnapshot. */
export interface Holding extends HoldingInput {
  entity_id: string;
  currency: string;
  market_value_base: number;
  cost_basis_base: number;
  unrealized_pnl_base: number;
}

export interface Totals {
  aum_base: number;
  cost_basis_base: number;
  unrealized_pnl_base: number;
  unrealized_pnl_pct: number;
}

export interface EntityRollup {
  entity_id: string;
  name: string;
  aum_base: number;
  weight_pct: number;
  unrealized_pnl_base: number;
}

export interface AssetClassRollup {
  asset_class: string;
  aum_base: number;
  weight_pct: number;
}

export interface InstitutionRollup {
  institution: string;
  aum_base: number;
  weight_pct: number;
}

export interface Warning {
  id: string;
  severity: string;
  entity_id?: string;
  message: string;
  detail?: string;
}

export interface Insight {
  id: string;
  code: string;
  severity: Severity;
  category: string;
  params: Record<string, unknown>;
}

export type FxRates = Record<string, number>;

export interface ConsolidatedSnapshot {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  source: string;
  base_currency: string;
  fx_rates: FxRates;
  entities: Entity[];
  accounts: AccountRef[];
  holdings: Holding[];
  totals: Totals;
  by_entity: EntityRollup[];
  by_asset_class: AssetClassRollup[];
  by_institution: InstitutionRollup[];
  insights?: Insight[];
  warnings: Warning[];
}

export type TargetAllocation = Record<string, number>;

export interface Config {
  entities?: Entity[];
  institutions?: string[];
  base_currency?: string;
  fx_rates?: FxRates;
  target_allocation?: TargetAllocation;
  data_provider?: string;
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
  fx_rates: FxRates;
  entities: Array<{ entity_id: string; name: string; type: string; member: string }>;
  institutions: string[];
}

export interface BuildSnapshotInput {
  snapshot_id?: string;
  generated_at?: string;
  base_currency?: string;
  fx_rates?: FxRates;
  entities?: Entity[];
  accounts?: AccountRef[];
  holdings?: HoldingInput[];
  source?: string;
  warnings?: Warning[];
}
