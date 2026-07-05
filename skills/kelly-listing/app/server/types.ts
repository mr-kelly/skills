// Core domain types shared across the kelly-listing server, rules engine, demo
// scenes, and scripts. These model the ACTUAL shapes produced by demo.ts /
// rules.ts / store.ts and the listing_snapshot.json in references/listing-schema.md.
// Kept loose (optional fields + index signatures) because snapshots on disk
// evolve and drafts differ by platform.

export type Platform = "amazon" | "shopify" | "tiktok_shop" | "ebay";
export type Lang = "en" | "zh";
export type CheckResult = "pass" | "warn" | "fail";
export type Severity = "error" | "warning" | "info";
export type DraftStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type DecisionAction = "approve" | "request_changes" | "block" | "revise";

export interface ItemSpecific {
  name?: string;
  value?: string;
}

export interface DraftFields {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  description?: string;
  search_terms?: string;
  seo_title?: string;
  seo_description?: string;
  selling_points?: string[];
  aplus_outline?: string[];
  item_specifics?: ItemSpecific[];
  [key: string]: unknown;
}

export interface Draft {
  draft_id: string;
  ref?: number;
  product_id: string;
  platform: string;
  locale?: string;
  variant_group?: string;
  status?: string;
  keyword_strategy?: string;
  fields?: DraftFields;
  compliance_score?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ProductSpec {
  name?: string;
  value?: string;
}

export interface ProductImage {
  name?: string;
  status?: string;
}

export interface Product {
  product_id: string;
  ref?: number;
  name?: string;
  sku?: string;
  category?: string;
  source?: string;
  platforms?: string[];
  locales?: string[];
  specs?: ProductSpec[];
  features?: string[];
  keywords?: string[];
  images?: ProductImage[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RuleResult {
  rule_id: string;
  severity: string;
  result: CheckResult | string;
  evidence: string;
}

export interface Check {
  check_id: string;
  draft_id: string;
  rule_id: string;
  severity: string;
  result: CheckResult | string;
  evidence: string;
  checked_at?: string;
}

export interface RuleCatalogEntry {
  rule_id: string;
  name: string;
  severity: string;
  platforms: string[];
}

export interface ReviewItem {
  review_id: string;
  ref?: number;
  draft_id: string;
  status?: string;
  compliance_summary?: string;
  suggestions?: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface Metrics {
  product_count: number;
  draft_count: number;
  drafts_by_platform: Record<string, number>;
  drafts_needs_review: number;
  drafts_approved: number;
  drafts_in_revision: number;
  checks_failed: number;
  compliance_pass_rate: number;
  exported_this_week: number;
  [key: string]: unknown;
}

export interface Snapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  seller: { brand: string; entity: string; [key: string]: unknown };
  metrics: Partial<Metrics>;
  products: Product[];
  drafts: Draft[];
  rules: RuleCatalogEntry[];
  checks: Check[];
  review_items: ReviewItem[];
  activity_log: unknown[];
  warnings: unknown[];
  [key: string]: unknown;
}

// ---- Config shapes ----

export interface PlatformRules {
  title_max_chars?: number;
  bullets_exact?: number;
  search_terms_max_bytes?: number;
  seo_title_max_chars?: number;
  seo_description_max_chars?: number;
  min_selling_points?: number;
  required_fields?: string[];
  extra_banned_words?: string[];
  [key: string]: unknown;
}

export interface PlatformConfig {
  platform: string;
  enabled?: boolean;
  locales?: string[];
  rules?: PlatformRules;
}

export interface Config {
  banned_words?: string[];
  competitor_brands?: string[];
  keyword_stuffing?: { max_repeats?: number };
  allowed_all_caps?: string[];
  platforms?: PlatformConfig[];
  rule_names?: Record<string, string>;
  seller?: Record<string, unknown>;
  locales?: string[];
  export?: Record<string, unknown>;
  publish?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

// ---- Store / decision shapes ----

export interface DecisionPayload {
  action?: string;
  review_id?: string;
  draft_id?: string;
  comment?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---- Request query shapes ----

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}
