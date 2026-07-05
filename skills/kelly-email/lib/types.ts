// Core domain types shared across the kelly-email lib, server, and scripts.
// These model the ACTUAL shapes produced by common.ts / data-provider / the
// batch-store, using string-literal unions instead of enums (erasable-only TS).

// ---- Item status / action / language unions ----

export type ItemStatus = "prepared" | "needs_review" | "draft_requested" | "drafted" | "executed" | string;

export type ProposedAction = "archive" | "mark_read" | "send_reply" | "draft_reply" | "keep_unread" | "review" | string;

export type DecisionActionKind =
  | "archive"
  | "mark_read"
  | "send_reply"
  | "draft_reply"
  | "keep_unread"
  | "no_action"
  | "needs_review"
  | "revise"
  | string;

export type ExecutionStatusKind = "executed" | "blocked" | "error" | "dry_run" | string;

export type LanguageCode = "en" | "zh-CN" | "unknown" | string;

// ---- Decision / execution sub-shapes ----

export interface ItemDecision {
  action?: DecisionActionKind;
  decided_at?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface ItemExecution {
  status?: ExecutionStatusKind;
  action?: string;
  mailbox_operation?: string;
  target_folder?: string;
  mark_read?: boolean;
  reason?: string;
  executed_at?: string;
  checked_at?: string;
  [key: string]: unknown;
}

export interface ReviewBrief {
  user_language?: string;
  suggested_reply?: string;
  background?: string;
  why_review?: string;
  recommendation?: string;
  [key: string]: unknown;
}

export interface Attachment {
  filename?: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  content?: Buffer;
  contentId?: string;
  content_id?: string;
  url?: string;
  preview?: boolean;
  [key: string]: unknown;
}

// ---- Email review item (normalized) ----

export interface ReviewItem {
  id: string;
  uid: string;
  thread_id?: string;
  account?: string;
  from?: string;
  to?: string;
  date?: string;
  subject?: string;
  category?: string;
  risk?: string[];
  status?: ItemStatus;
  review_status?: string;
  proposed_action?: ProposedAction;
  recommended_action?: string;
  reason?: string;
  review_reason?: string;
  review_brief?: ReviewBrief;
  suggested_reply?: string;
  summary?: string;
  body?: string;
  body_preview?: string;
  body_original?: string;
  body_original_language?: LanguageCode;
  body_translation?: string;
  translated_body?: string;
  body_translation_language?: LanguageCode;
  translation_language?: string;
  user_language?: LanguageCode;
  source_language?: LanguageCode;
  html?: string;
  has_html?: boolean;
  quote_preview?: string;
  attachments?: Attachment[];
  draft?: string;
  decision?: ItemDecision;
  execution?: ItemExecution;
  execution_override?: Record<string, unknown>;
  user_comment?: string;
  updated_at?: string;
  folder?: string;
  message_id?: string;
  cc?: string;
  classification_method?: unknown;
  classification_pipeline_version?: unknown;
  rule_prefilter?: unknown;
  agent_review?: unknown;
  review_number?: number | null;
  review_ref?: string;
  target_folder?: string;
  archive_folder?: string;
  [key: string]: unknown;
}

// ---- Batch / decisions ----

export interface Batch {
  batch_id?: string;
  generated_at?: string;
  updated_at?: string;
  source?: string;
  last_scan?: unknown;
  items?: ReviewItem[];
  [key: string]: unknown;
}

export interface DecisionRecord {
  id?: string;
  uid?: string;
  thread_id?: string;
  subject?: string;
  from?: string;
  proposed_action?: string;
  decision?: ItemDecision;
  edited_draft?: string;
  suggested_reply?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface DecisionsPayload {
  batch_id?: string;
  updated_at?: string;
  decisions?: DecisionRecord[];
}

// ---- Config (freeform, read from JSON) ----

export interface ContactMethod {
  label?: string;
  value?: string;
}

export interface Brand {
  brand_id?: string;
  name?: string;
  description?: string;
  homepage?: string;
  docs_url?: string;
  support_url?: string;
  youtube_url?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  display_name?: string;
  role?: string;
  company?: string;
  default_reply_as?: string;
  languages?: string[];
  public_bio?: string;
  contact_methods?: ContactMethod[];
  [key: string]: unknown;
}

export interface Style {
  preset?: string;
  default_language?: string;
  tone?: string;
  audience?: string;
  max_reply_words?: number | string;
  paragraph_style?: string;
  include_short_quote?: boolean;
  signature_mode?: string;
  preferred_signoff?: string;
  reply_rules?: string[];
  cta_urls?: Record<string, string>;
  [key: string]: unknown;
}

export interface KnowledgeSource {
  source_id?: string;
  type?: string;
  title?: string;
  url?: string;
  path?: string;
  use_for?: string[];
  enabled?: boolean;
  [key: string]: unknown;
}

export interface KnowledgeBase {
  enabled?: boolean;
  usage?: string;
  facts?: string[];
  do_not_say?: string[];
  sources?: KnowledgeSource[];
  [key: string]: unknown;
}

export interface Identity {
  identity_id?: string;
  send_as_email?: string;
  display_name?: string;
  brand_or_product?: string;
  reply_to?: string;
  mailbox_id?: string;
  use_when?: { recipient_addresses?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface MailboxEndpoint {
  host?: string;
  username?: string;
  password_env?: string;
  [key: string]: unknown;
}

export interface Mailbox {
  mailbox_id?: string;
  display_name?: string;
  primary_email?: string;
  provider?: string;
  aliases?: string[];
  support_folders_or_labels?: string[];
  mailbox_group_id?: string;
  imap?: MailboxEndpoint;
  smtp?: MailboxEndpoint;
  archive_routing?: Record<string, unknown>;
  archive_folder?: string;
  send_identities?: string[];
  [key: string]: unknown;
}

export interface Config {
  mailboxes?: Mailbox[];
  identities?: Identity[];
  user_profile?: UserProfile;
  brands?: Brand[];
  style?: Style;
  knowledge_base?: KnowledgeBase;
  official_urls?: Record<string, string>;
  risk_policy?: {
    review_keywords?: Record<string, string[]>;
    block_by_default?: string[];
    [key: string]: unknown;
  };
  archive_routing?: Record<string, unknown>;
  reply_provider?: string;
  busabase?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---- Config metadata (from data-provider) ----

export interface ConfigMeta {
  reader?: string;
  provider?: string;
  source?: string;
  is_example?: boolean;
  has_private_config?: boolean;
  candidates?: string[];
  legacy_candidates?: string[];
  legacy_source?: string;
  legacy_config_format?: boolean;
  recommended_config?: string;
  recommended_env?: string;
  example_config?: string;
  [key: string]: unknown;
}

export interface ConfigWithMeta extends ConfigMeta {
  config: Config;
}

export interface Onboarding {
  configured?: boolean;
  state?: string;
  reader?: string;
  message?: string;
  missing_env?: string[];
  config_candidates?: string[];
  legacy_source?: string;
  recommended_config?: string;
  recommended_env?: string;
  example_config?: string;
  [key: string]: unknown;
}

// ---- Reply-review store ----

export interface ReplyReviewMeta {
  config: Config;
  source: string | null;
  skillDir?: string;
  [key: string]: unknown;
}

export interface ReplyRecord {
  reply_id: string;
  email_id: string;
  thread_id?: string;
  to: string;
  subject: string;
  draft: string;
  status: string;
  comment?: string;
  history?: Array<{ draft: string; at?: string }>;
  updated_at?: string;
  sent_at?: string;
  send_result?: unknown;
  [key: string]: unknown;
}

export interface ReplyReviewInput {
  verdict?: string;
  edits?: string | null;
  comment?: string;
}

export interface OpenReplyDraftInput {
  email_id?: string;
  to?: string;
  subject?: string;
  draft?: string;
  thread_id?: string;
}
