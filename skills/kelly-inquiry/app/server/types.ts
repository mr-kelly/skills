// Core domain types shared across the kelly-inquiry server, provider, and
// scripts. These model the ACTUAL shapes produced by demo.ts / store.ts and the
// normalized snapshot in references/inquiry-schema.md.

export type Stage = "new" | "replied" | "quoted" | "negotiating" | "won" | "lost";
export type Channel = "whatsapp" | "instagram" | "messenger" | "email";
export type Connector =
  | "whatsapp_cloud"
  | "instagram_graph"
  | "messenger_graph"
  | "email_agent"
  | "browser_agent"
  | "manual";
export type QuoteStatus = "draft" | "sent" | "accepted" | "expired" | "declined";
export type ApprovalStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type MessageDirection = "incoming" | "outgoing";

export interface Customer {
  name: string;
  company?: string;
  country?: string;
  source?: string;
}

export interface Message {
  message_id: string;
  direction: MessageDirection;
  sender: string;
  text: string;
  sent_at: string;
  attachment?: string;
}

export interface Inquiry {
  inquiry_id: string;
  account_id: string;
  channel: Channel | string;
  customer: Customer;
  product_interest?: string;
  product_ids: string[];
  quote_ids: string[];
  stage: Stage | string;
  value_estimate: number;
  currency: string;
  owner: string;
  unread: boolean;
  created_at: string;
  last_message_at: string;
  last_incoming_at?: string;
  next_follow_up?: string;
  provider_conversation_id?: string;
  suggested_reply?: string;
  messages: Message[];
}

export interface FaqEntry {
  q: string;
  a: string;
}

export interface Product {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  moq: number;
  price_min?: number;
  price_max?: number;
  currency: string;
  lead_time_days: number;
  specs: Record<string, string>;
  faq: FaqEntry[];
}

export interface QuoteLine {
  line_id: string;
  product_id?: string;
  sku: string;
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface PricingAlert {
  product_id: string;
  sku: string;
  unit_price: number;
  price_min: number;
  message: string;
}

export interface Quote {
  quote_id: string;
  quote_no: string;
  inquiry_id: string;
  customer: string;
  currency: string;
  status: QuoteStatus | string;
  issue_date: string;
  valid_until: string;
  items: QuoteLine[];
  subtotal: number;
  total: number;
  terms?: string;
  pricing_notes?: string;
  pricing_alerts: PricingAlert[];
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  account_id: string;
  channel: Channel | string;
  connector: Connector | string;
  display_name: string;
  handle?: string;
  status: string;
  inquiry_count: number;
  unread_count: number;
  last_sync_at?: string;
}

export interface Decision {
  action: string;
  comment: string;
  decided_at: string;
  text?: string;
  status?: string;
}

export interface Execution {
  status: string;
  operation: string;
  connector?: string;
  target?: string;
  detail?: string;
  executed_at?: string;
}

export interface Approval {
  item_id: string;
  ref: number;
  kind: string;
  inquiry_id: string;
  quote_id?: string;
  account_id: string;
  channel: Channel | string;
  customer: string;
  text: string;
  note?: string;
  reason?: string;
  suggested_by?: string;
  status: ApprovalStatus | string;
  decision?: Decision | null;
  execution?: Execution | null;
  created_at: string;
  updated_at?: string;
}

export interface SyncLogEntry {
  sync_id: string;
  account_id: string;
  method: string;
  at: string;
  status: string;
  message?: string;
  new_messages: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  account_id?: string;
  detail?: string;
}

export interface Metrics {
  account_count: number;
  inquiry_count: number;
  quote_count: number;
  product_count: number;
  unanswered_new_count: number;
  quotes_sent: number;
  win_rate: number;
  reply_median_minutes: number;
  inquiries_this_week: { total: number; by_channel: Record<string, number> };
  stage_counts: Record<string, number>;
}

export interface InquirySnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  base_currency: string;
  metrics: Metrics;
  accounts: Account[];
  inquiries: Inquiry[];
  quotes: Quote[];
  products: Product[];
  approvals: Approval[];
  sync_log: SyncLogEntry[];
  warnings: Warning[];
}

export interface DecisionsFile {
  schema_version: string;
  updated_at: string;
  decisions: Record<string, Decision>;
}

export interface AgentTask {
  task_id: string;
  type: string;
  item_id: string;
  ref: number;
  inquiry_id: string;
  quote_id: string;
  comment: string;
  status: string;
  requested_at: string;
}

export interface AgentTasksFile {
  schema_version: string;
  updated_at: string;
  tasks: AgentTask[];
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Lock {
  owner?: string;
  message?: string;
  started_at?: string;
}

// ---- Config ----

export interface ConfigAccount {
  account_id?: string;
  channel?: string;
  connector?: string;
  display_name?: string;
  handle?: string;
  [key: string]: unknown;
}

export interface Config {
  accounts?: ConfigAccount[];
  quote_defaults?: Record<string, unknown> & {
    min_price_guard?: { enabled?: boolean; block_below_price_min?: boolean };
  };
  follow_up?: Record<string, unknown> | null;
  reply_style?: Record<string, unknown> | null;
  product_kb?: { source_path?: string } | null;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}
