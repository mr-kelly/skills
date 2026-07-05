// Core domain types shared across the kelly-invest-webull server, provider, and
// scripts. These model the ACTUAL shapes produced by demo.ts / store.ts /
// insights.ts and the normalized snapshot in references/portfolio-schema.md.

export type AssetType = "STOCK" | "ETF" | "OPTION" | "CRYPTO" | "OTHER";
export type AccountType = "CASH" | "MARGIN";
export type Severity = "info" | "watch" | "high";

export interface Account {
  account_id: string;
  account_type: AccountType;
  display_name: string;
  currency: string;
  net_liquidation: number;
  total_cash: number;
  buying_power: number;
}

export interface Position {
  symbol: string;
  name: string;
  asset_type: AssetType;
  account_id: string;
  quantity: number;
  avg_cost: number;
  last_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  day_change: number;
  day_change_pct: number;
  currency: string;
  weight_pct: number;
}

export interface Totals {
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  day_change: number;
  day_change_pct: number;
  total_cash: number;
}

export interface AllocationSlice {
  asset_type: AssetType | string;
  market_value: number;
  weight_pct: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  account_id?: string;
  detail?: string;
}

export interface Insight {
  id: string;
  code: string;
  severity: Severity;
  category: string;
  params: Record<string, unknown>;
}

export interface PortfolioSnapshot {
  schema_version: string;
  snapshot_id: string;
  generated_at: string;
  source: string;
  base_currency: string;
  accounts: Account[];
  positions: Position[];
  totals: Totals;
  allocation: AllocationSlice[];
  warnings: Warning[];
  insights?: Insight[];
}

// asset_type -> target allocation percentage (e.g. { STOCK: 45, ETF: 35, ... }).
export type TargetAllocation = Record<string, number>;

// ---- Config (as it appears in store.ts) ----

export interface WebullConfig {
  region?: string;
  base_url?: string;
  account_allowlist?: string[];
  app_key_env?: string;
  app_secret_env?: string;
}

export interface Config {
  base_currency?: string;
  data_provider?: string;
  target_allocation?: TargetAllocation;
  webull?: WebullConfig;
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
  webull: {
    region: string;
    base_url: string;
    account_allowlist: string[];
    secret_envs: string[];
    secrets_ready: boolean;
  };
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
