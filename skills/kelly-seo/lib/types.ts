// Shared types for the kelly-seo data-provider layer and scripts. These model
// the ACTUAL shapes flowing through lib/data-provider/*.ts — a GSC analytics
// snapshot plus an SEO-opportunity approval queue (snapshot -> opportunities ->
// decisions -> execution report). The rich domain shapes (SeoSnapshot, Opportunity,
// ...) live in app/server/types.ts and are re-exported here for provider code.

import type { Decision } from "../app/server/types.ts";

export type {
  Decision,
  DecisionAction,
  Execution,
  Opportunity,
  OpportunityStatus,
  OpportunityType,
  SeoSnapshot,
  SnapshotMetrics,
  Warning,
} from "../app/server/types.ts";

// A configured Search Console property.
export interface SiteConfig {
  site_id?: string;
  property_url?: string;
  verification_type?: string;
  permission_level?: string;
}

export interface AuthConfig {
  method?: string;
  service_account_file_env?: string;
  access_token_env?: string;
}

export interface SyncConfig {
  window_days?: number;
  compare_previous_period?: boolean;
  row_limit?: number;
  read_only?: boolean;
}

export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

// Config as loaded from config.local.json / config.example.json / env.
export interface Config {
  data_provider?: string;
  sites?: SiteConfig[];
  auth?: AuthConfig;
  sync?: SyncConfig;
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

// Result of readConfig(); passed to each provider factory.
export interface ProviderMeta {
  config?: Config;
  path?: string;
  is_example?: boolean;
}

// Payload for a human verdict on one opportunity.
export interface DecisionInput {
  id?: string;
  action?: string;
  note?: string;
  draft?: string | null;
}

// Result of applying a decision (mirrors store.applyDecision's return).
export interface DecisionResult {
  ok: boolean;
  status?: number;
  error?: string;
}

// Stored map of decisions keyed by opportunity id.
export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

// Stored agent-task queue.
export interface AgentTasksFile {
  updated_at: string;
  tasks: unknown[];
}

// Error carrying an HTTP status code, thrown by providers and read by the Hono
// server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
