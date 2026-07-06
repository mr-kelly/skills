// Shared types for the kelly-listing data-provider layer. The domain shapes
// (Snapshot, Draft, Config, DecisionPayload, ...) already live in
// app/server/types.ts; re-export them here so provider code has one import
// surface, then add the provider-layer and claims-registry types on top.

export type {
  Check,
  Config,
  ConfigResult,
  DecisionPayload,
  Draft,
  DraftFields,
  Metrics,
  Product,
  ReviewItem,
  Snapshot,
} from "../app/server/types.ts";

// ---- Provider-layer shapes ----

// config.busabase block (env overrides win at read time).
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

// Result of loadConfig() in lib/data-provider/index.ts, passed to providers.
export interface ProviderMeta {
  config?: Record<string, unknown>;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by providers and read by the Hono
// server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// ---- Claims / compliance registry ----

export type ClaimStatus = "approved" | "pending" | "rejected";
export type ClaimRuleType = "banned_word" | "restricted_phrase";

// One approved (or pending / rejected) marketing claim, with the evidence that
// substantiates it. The compliance engine treats an approved claim as safe to
// use verbatim; a pending or rejected claim used in a draft is flagged.
export interface Claim {
  claim_id: string;
  text: string;
  status: ClaimStatus;
  category?: string;
  substantiation?: string;
  evidence?: string[];
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// A banned-word or restricted-phrase rule. `phrase` is matched against the
// draft corpus; `reason` explains why it is off-limits and `alternative`
// suggests replacement copy.
export interface ClaimRule {
  rule_id: string;
  phrase: string;
  type: ClaimRuleType;
  severity?: string;
  reason?: string;
  alternative?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ClaimsRegistry {
  updated_at: string;
  claims: Claim[];
  rules: ClaimRule[];
}

// Payload for upserting a claim or a rule through the provider.
export interface ClaimPayload {
  claim_id?: string;
  text?: string;
  status?: ClaimStatus;
  category?: string;
  substantiation?: string;
  evidence?: string[];
  approved_by?: string;
  notes?: string;
  [key: string]: unknown;
}
