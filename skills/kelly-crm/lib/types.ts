// Shared types for the kelly-crm data-provider layer and scripts. These model
// the ACTUAL shapes flowing through lib/data-provider/*.ts and the CRM scripts —
// a follow-up-review workflow (snapshot -> followups -> decisions -> execution).

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
  handoff_skill?: string;
  token_env?: string;
  api_key_env?: string;
  password_env?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  operator?: Record<string, unknown>;
  pipeline?: { stages?: string[]; base_currency?: string };
  style?: { tone?: string; [key: string]: unknown };
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

// Human verdict on a follow-up, POSTed to /api/decision.
export interface DecisionBody {
  followup_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
