// Shared types for the kelly-brand data-provider layer and scripts. These model
// the ACTUAL shapes flowing through lib/data-provider/*.ts and the brand scripts —
// a narrative-review workflow (snapshot -> narrative items + drift alerts ->
// decisions -> execution).

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Channel {
  channel_id?: string;
  type?: string;
  display_name?: string;
  monitored?: boolean;
  source_url_env?: string;
  token_env?: string;
  api_key_env?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  brand?: Record<string, unknown>;
  style?: { tone?: string; reading_level?: string; [key: string]: unknown };
  official_urls?: Record<string, unknown>;
  risk_policy?: { banned_phrases?: unknown; regulated_claims?: unknown; [key: string]: unknown };
  channels?: Channel[];
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

// Human verdict on a narrative item or drift alert, POSTed to /api/decision.
export interface DecisionBody {
  item_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
