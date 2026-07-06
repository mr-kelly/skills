// Shared types for the kelly-creators data-provider layer and scripts. These
// model the ACTUAL shapes flowing through lib/data-provider/*.ts and the
// creators scripts — a creator-outreach review workflow
// (snapshot -> creators -> decisions -> execution).

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Platform {
  platform_id?: string;
  type?: string;
  display_name?: string;
  handoff_skill?: string;
  token_env?: string;
  api_key_env?: string;
  password_env?: string;
  [key: string]: unknown;
}

export interface Brand {
  brand_id?: string;
  display_name?: string;
  positioning?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  operator?: Record<string, unknown>;
  program?: { base_currency?: string; budget_total?: number; target_niches?: string[] };
  brands?: Brand[];
  style?: { tone?: string; [key: string]: unknown };
  platforms?: Platform[];
  [key: string]: unknown;
}

// Result of readConfig()/loadConfig(); passed to providers as ProviderMeta.
export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Human verdict on a creator engagement, POSTed to /api/decision.
export interface DecisionBody {
  creator_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
