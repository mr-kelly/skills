// Shared types for the kelly-campaigns data-provider layer and scripts. These
// model the ACTUAL shapes flowing through lib/data-provider/*.ts and the
// campaigns scripts — an approve-before-send workflow (snapshot -> sends ->
// decisions -> execution) for email campaigns.

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Esp {
  provider?: string;
  display_name?: string;
  api_key_env?: string;
  token_env?: string;
  password_env?: string;
  [key: string]: unknown;
}

export interface FromIdentity {
  identity_id?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  use_when?: string[];
  [key: string]: unknown;
}

export interface Segment {
  segment_id?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  operator?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  esp?: Esp;
  from_identities?: FromIdentity[];
  segments?: Segment[];
  sending_policy?: Record<string, unknown>;
  style?: { tone?: string; [key: string]: unknown };
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

// Human verdict on a send, POSTed to /api/decision.
export interface DecisionBody {
  send_id?: string;
  action?: string;
  comment?: string;
  body?: string;
  chosen_variant?: string;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
