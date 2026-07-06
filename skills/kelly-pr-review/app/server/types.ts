// Core domain types shared across the kelly-pr-review server, data-provider,
// and scripts. These model the ACTUAL shapes produced by demo.ts, the
// data-provider layer (lib/data-provider/*.ts), generate_review_batch.ts, and
// the local-file-reader config. lib/types.ts re-exports these to the providers.

export type WorkflowStatus = "needs_review" | "to_approve" | "approved" | "done" | "blocked" | "merged";
export type VerificationStatus = "needs_test" | "tested" | "";
export type ReviewAction = "approve" | "comment" | "request_changes" | "no_action" | "needs_review" | "block";

export interface Decision {
  action?: ReviewAction | string;
  comment?: string;
  review_body?: string;
  approved_for_execution?: boolean;
  decided_at?: string;
}

export interface Execution {
  status?: string;
  action?: string;
  executed_at?: string;
}

export interface TestEvidence {
  filename: string;
  content_type: string;
  size: number;
  path: string;
  url: string;
  uploaded_at: string;
}

export interface ReviewItem {
  id: string;
  review_ref?: string;
  review_number?: number;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  summary: string;
  body?: string;
  status: WorkflowStatus | string;
  proposed_action: ReviewAction | string;
  reason: string;
  risk: string[];
  labels: string[];
  changed_files: string[];
  additions: number;
  deletions: number;
  comments_count: number;
  checks?: string;
  state?: string;
  merged: boolean;
  merged_at?: string;
  verification_status?: VerificationStatus | string;
  tested?: boolean;
  tested_at?: string;
  test_note?: string;
  test_evidence?: TestEvidence[];
  is_draft?: boolean;
  created_at?: string;
  updated_at: string;
  review_body?: string;
  patch_excerpt?: string;
  decision?: Decision;
  execution?: Execution;
}

export interface BatchMetrics {
  needs_review: number;
  to_approve: number;
  approved: number;
  done: number;
  blocked: number;
  needs_test: number;
  tested: number;
}

export interface ReviewBatch {
  batch_id: string;
  generated_at: string;
  updated_at?: string;
  source: string;
  mode: string;
  metrics: BatchMetrics | Record<string, number>;
  items: ReviewItem[];
  reused_cache?: boolean;
}

// ---- Query shapes (route + demo params) ----

export interface StateQuery {
  demo?: string | boolean;
  lang?: string;
  repo?: string;
  mode?: string;
  q?: string;
}

export interface DecisionBody {
  id?: string;
  ids?: string[];
}

// ---- Tested cache ----

export interface TestedCacheEntry {
  id: string;
  tested: boolean;
  tested_at: string;
  note: string;
  evidence: TestEvidence[];
  updated_at: string;
}

export interface TestedCache {
  updated_at: string;
  items: Record<string, TestedCacheEntry>;
}

// Raw value read off disk before normalization (any field may be absent).
export interface RawTestedEntry {
  tested?: boolean;
  tested_at?: string;
  note?: string;
  evidence?: TestEvidence[];
  updated_at?: string;
}

export interface RawTestedPayload {
  updated_at?: string;
  items?: Record<string, RawTestedEntry>;
}

export interface SetTestedOptions {
  note?: string;
  evidence?: EvidenceUpload[];
}

export interface EvidenceUpload {
  content_type?: string;
  type?: string;
  base64?: string;
  filename?: string;
}

// ---- Config (local-file-reader) ----

export interface RepoConfig {
  repo: string;
  label?: string;
  include?: boolean;
}

export interface ReviewerConfig {
  handle?: string;
  display_name?: string;
}

export interface ReviewPolicyConfig {
  default_action?: string;
  include_patch_excerpt?: boolean;
  max_patch_chars?: number;
  large_diff_changed_files?: number;
  large_diff_additions?: number;
  risk_keywords?: Record<string, string[]>;
}

export interface ReviewQueryConfig {
  state?: string;
  review_requested?: string;
  limit?: number;
  merged_limit?: number;
  merged_at?: string;
  sort?: string;
  order?: string;
  include_drafts?: boolean;
}

export interface ReviewConfig {
  reviewer?: ReviewerConfig;
  repos?: RepoConfig[];
  query?: ReviewQueryConfig;
  review_policy?: ReviewPolicyConfig;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConfigMeta {
  reader?: string;
  configured?: boolean;
  config?: ReviewConfig;
  source?: string;
  legacy_source?: string;
  example_only?: boolean;
  default_mode?: boolean;
  onboarding?: Record<string, unknown>;
}
