// Shared types for the kelly-creators data-provider layer and scripts. These
// model the ACTUAL shapes flowing through lib/data-provider/*.ts and the
// creator-review workflow (snapshot -> creators -> decisions -> execution).

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface OperatorConfig {
  name?: string;
  role?: string;
  company?: string;
  timezone?: string;
}

export interface ProgramConfig {
  base_currency?: string;
  budget_total?: number | string;
  target_niches?: string[];
}

export interface BrandConfig {
  brand_id?: string;
  display_name?: string;
  positioning?: string;
}

export interface PlatformConfig {
  platform_id?: string;
  type?: string;
  display_name?: string;
  handoff_skill?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  operator?: OperatorConfig;
  program?: ProgramConfig;
  brands?: BrandConfig[];
  platforms?: PlatformConfig[];
  style?: { tone?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// Result of readConfig(); passed to providers and summarized for the UI.
export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// The human verdict on a single creator engagement.
export interface DecisionBody {
  creator_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

// Options for the executor (execute_decisions script + provider.executeDecisions).
export interface ExecuteOptions {
  apply?: boolean;
}
