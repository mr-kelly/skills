// Shared types for the kelly-pr-review data-provider layer. These re-export the
// core domain shapes (ReviewItem / ReviewBatch / TestedCache / config) that
// already live in app/server/types.ts, and add the provider-config shapes
// (ProviderMeta / BusabaseConfig / HttpError) that mirror the kelly-writer
// template. The domain model — a GitHub PR review queue (batch -> items ->
// decisions -> execution) plus a merged-PR tested-cache — is unchanged; this
// file only names the seam between the server/scripts and the providers.

export type {
  BatchMetrics,
  ConfigMeta,
  Decision,
  DecisionBody,
  EvidenceUpload,
  Execution,
  RawTestedEntry,
  RawTestedPayload,
  RepoConfig,
  ReviewAction,
  ReviewBatch,
  ReviewConfig,
  ReviewItem,
  ReviewerConfig,
  ReviewPolicyConfig,
  ReviewQueryConfig,
  SetTestedOptions,
  StateQuery,
  TestEvidence,
  TestedCache,
  TestedCacheEntry,
  VerificationStatus,
  WorkflowStatus,
} from "../app/server/types.ts";

// ---- Provider config (env + config.*.json) ----

// Busabase target coordinates, read from config.busabase (env overrides win).
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

// Result of loadConfigWithMeta() in lib/data-reader; passed to providers so
// they can echo a sanitized summary and (busabase) find their target base.
export interface ProviderMeta {
  reader?: string;
  configured?: boolean;
  config?: Record<string, unknown>;
  source?: string;
  legacy_source?: string;
  example_only?: boolean;
  default_mode?: boolean;
  onboarding?: Record<string, unknown>;
}

// Error carrying an HTTP status code, thrown by providers and mapped by Hono.
export interface HttpError extends Error {
  statusCode?: number;
}
