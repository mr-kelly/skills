// Shared types for the kelly-launch data-provider layer, hono server, and
// scripts. These model the ACTUAL shapes flowing through lib/data-provider/*.ts
// — a product-launch review workflow (snapshot -> items -> decisions ->
// execution report) built on the RAMP framework.

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  channels?: unknown[];
  [key: string]: unknown;
}

// Result of readConfig(): the raw config plus where it came from.
export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

// Body accepted by applyDecision()/saveDecision().
export interface DecisionBody {
  item_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

// Error carrying an HTTP status code. The hono server maps decision failures to
// 400/423; providers set `.statusCode` on the thrown Error to signal that.
export interface HttpError extends Error {
  statusCode?: number;
}

// Result of loadConfig()-style discovery; passed to each provider factory.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}
