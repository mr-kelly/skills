// Core domain types shared across the kelly-support data-provider layer, server,
// and scripts. These model the ACTUAL shapes produced by app/server/demo.ts and
// the local provider, and the normalized snapshot in references/support-schema.md.
//
// Domain: a post-sales customer-support desk. The agent triages incoming support
// tickets from multiple channels, drafts KB-grounded replies, and proposes
// actions; the human reviews/edits/approves in a local UI before anything is
// sent. SLA + CSAT are tracked, and a pre-send quality gate (support-qa) blocks
// risky sends (unapproved refunds/commitments, ungrounded or KB-contradicting).

export type TicketStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type Channel = "email" | "whatsapp" | "webchat" | "form" | "wechat";
export type Connector = "email_agent" | "whatsapp_cloud" | "webchat_widget" | "form_intake" | "wechat_work" | "manual";
export type Category = "bug" | "how_to" | "billing" | "refund" | "complaint" | "feature";
export type Priority = "urgent" | "high" | "normal" | "low";
export type ProposedAction = "send_reply" | "escalate" | "refund" | "close" | "no_action";
export type GateVerdict = "ship" | "fix" | "block";
export type MessageDirection = "incoming" | "outgoing";

export interface Customer {
  name: string;
  company?: string;
  email?: string;
  handle?: string;
  country?: string;
  plan?: string;
}

export interface Message {
  message_id: string;
  direction: MessageDirection;
  sender: string;
  text: string;
  sent_at: string;
  attachment?: string;
}

// A support ticket. `suggested_reply` is the KB-grounded draft the human edits /
// approves; `kb_refs` cites which knowledge_base articles it used. `sla` tracks
// the due-by and whether it has breached. `quality_gate` is the support-qa result.
export interface Sla {
  policy: string;
  due_by: string;
  breached: boolean;
  first_response_at?: string;
}

export interface GateCheck {
  id: string;
  ok: boolean;
  message: string;
}

export interface QualityGate {
  verdict: GateVerdict | string;
  score: number;
  checks: GateCheck[];
  summary: string;
}

export interface Csat {
  score: number; // 1-5
  comment?: string;
  rated_at?: string;
}

export interface Ticket {
  ticket_id: string;
  ref: number;
  account_id: string;
  channel: Channel | string;
  customer: Customer;
  subject: string;
  body: string;
  category: Category | string;
  priority: Priority | string;
  status: TicketStatus | string;
  proposed_action: ProposedAction | string;
  reason?: string;
  suggested_reply: string;
  kb_refs: string[];
  sla: Sla;
  csat?: Csat | null;
  quality_gate?: QualityGate | null;
  owner: string;
  unread: boolean;
  created_at: string;
  last_message_at: string;
  last_incoming_at?: string;
  provider_conversation_id?: string;
  decision?: Decision | null;
  execution?: Execution | null;
  messages: Message[];
  updated_at?: string;
}

export interface KbArticle {
  article_id: string;
  kind: "article" | "macro" | string;
  title: string;
  body: string;
  tags: string[];
  category?: string;
  updated_at?: string;
}

export interface Account {
  account_id: string;
  channel: Channel | string;
  connector: Connector | string;
  display_name: string;
  handle?: string;
  status: string;
  ticket_count: number;
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
  channel?: string;
  target?: string;
  tier?: string;
  amount?: number;
  detail?: string;
  executed_at?: string;
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
  ticket_count: number;
  kb_count: number;
  open_count: number;
  awaiting_approval_count: number;
  breaching_sla_count: number;
  resolved_count: number;
  csat_average: number;
  csat_responses: number;
  first_response_median_minutes: number;
  tickets_this_week: { total: number; by_channel: Record<string, number> };
  by_category: Record<string, number>;
  status_counts: Record<string, number>;
  csat_trend: Array<{ label: string; score: number }>;
}

export interface SupportSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  metrics: Metrics;
  accounts: Account[];
  tickets: Ticket[];
  knowledge_base: KbArticle[];
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
  ticket_id: string;
  ref: number;
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

export interface ExecutionReport {
  report_id: string;
  mode: string;
  executed_at: string;
  results: unknown[];
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

// Busabase connection block (config.busabase; env overrides win). Present so a
// kelly-support base can serve the same review desk from a remote Busabase.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
  [key: string]: unknown;
}

export interface RiskPolicy {
  refund_requires_approval?: boolean;
  max_auto_refund?: number;
  block_ungrounded_replies?: boolean;
  block_commitments_without_approval?: boolean;
  [key: string]: unknown;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  accounts?: ConfigAccount[];
  knowledge_base?: { source_path?: string } | null;
  sla_policy?: Record<string, unknown> | null;
  risk_policy?: RiskPolicy | null;
  reply_style?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// Config metadata handed to each provider by createProvider(): the loaded config
// plus where it came from, so configSummary() can report the source.
export interface ProviderMeta {
  configResult: ConfigResult;
}
