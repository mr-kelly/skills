// Shared types for the kelly-campaigns data-provider layer and scripts. These
// model the ACTUAL shapes flowing through lib/data-provider/*.ts — an outbound
// email-review workflow (snapshot -> sends -> decisions -> execution) plus the
// consent/suppression list guarding pre-send.

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  from_identities?: unknown[];
  segments?: unknown[];
  [key: string]: unknown;
}

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// A single consent/suppression entry: a recipient or a whole segment that must
// not be mailed, with the reason it was suppressed and when.
export interface SuppressionEntry {
  // Exactly one of address / segment_id identifies the scope.
  address?: string;
  segment_id?: string;
  // unsubscribe | hard_bounce | complaint (extendable).
  reason: string;
  note?: string;
  suppressed_at: string;
  source?: string;
}

export interface SuppressionList {
  updated_at: string;
  entries: SuppressionEntry[];
}

// Decision payload posted from the review UI.
export interface DecisionBody {
  send_id?: string;
  action?: string;
  comment?: string;
  body?: string;
  chosen_variant?: string;
}
