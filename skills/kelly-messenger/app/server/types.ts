// Core domain types shared across the kelly-messenger server, provider, and
// scripts. These model the ACTUAL shapes produced by demo.ts / store.ts /
// sync_messages.ts / ingest_messages.ts and the normalized snapshot in
// references/messenger-schema.md.

export type Platform = "whatsapp" | "slack" | "discord" | "telegram" | string;
export type Connector = "slack" | "discord" | "telegram" | "whatsapp_cloud" | "browser_agent" | "manual" | string;
export type MessageDirection = "incoming" | "outgoing";
export type ConversationKind = "dm" | "group" | "channel" | "thread" | string;
export type ReplyStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";

export interface Message {
  message_id: string;
  direction: MessageDirection;
  sender: string;
  text: string;
  sent_at: string;
  attachment: string;
}

export interface Conversation {
  conversation_id: string;
  account_id: string;
  platform: Platform;
  kind: ConversationKind;
  title: string;
  channel: string;
  workspace: string;
  participants: string[];
  unread: boolean;
  awaiting_reply: boolean;
  provider_conversation_id: string;
  last_message_at: string;
  last_incoming_at: string;
  suggested_reply: string;
  messages: Message[];
}

export interface SnapshotAccount {
  account_id: string;
  platform: Platform;
  connector: Connector;
  display_name: string;
  workspace: string;
  status: string;
  unread_count: number;
  conversation_count: number;
  last_sync_at: string;
}

export interface SyncLogEntry {
  sync_id: string;
  account_id: string;
  method: string;
  at: string;
  status: string;
  message: string;
  new_messages: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  account_id?: string;
  detail?: string;
}

export interface SnapshotMetrics {
  account_count: number;
  conversation_count: number;
  message_count: number;
  unread_count: number;
  awaiting_reply_count: number;
}

export interface MessagesSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  metrics: SnapshotMetrics;
  accounts: SnapshotAccount[];
  conversations: Conversation[];
  sync_log: SyncLogEntry[];
  warnings: Warning[];
}

export interface ReplyDecision {
  action: string;
  comment: string;
  decided_at: string;
}

export interface ReplyExecution {
  status: string;
  operation: string;
  connector?: string;
  target?: string;
  detail?: string;
  executed_at?: string;
}

export interface Reply {
  reply_id: string;
  ref: number;
  conversation_id: string;
  account_id: string;
  platform: Platform;
  conversation_title: string;
  text: string;
  note: string;
  reason: string;
  suggested_by: string;
  status: ReplyStatus;
  decision: ReplyDecision | null;
  execution: ReplyExecution | null;
  created_at: string;
  updated_at: string;
}

export interface Outbox {
  schema_version: string;
  updated_at: string;
  replies: Reply[];
}

export interface AgentTask {
  task_id: string;
  type: string;
  reply_id: string;
  ref: number;
  conversation_id: string;
  comment: string;
  status: string;
  requested_at: string;
}

export interface AgentTasks {
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
  [key: string]: unknown;
}

// ---- Config (as it appears in store.ts / the scripts) ----

// Account entries in config.json carry optional connector credentials and the
// per-connector env-var names holding the secrets.
export interface ConfigAccount {
  account_id?: string;
  platform?: Platform;
  connector?: Connector;
  display_name?: string;
  workspace?: string;
  channels?: string[];
  phone_number_id?: string;
  [key: string]: unknown;
}

export interface ReplyStyle {
  tone?: string;
  language?: string;
  [key: string]: unknown;
}

export interface SyncConfig {
  default_limit?: number;
  cadence_minutes?: number;
  [key: string]: unknown;
}

export interface Config {
  accounts?: ConfigAccount[];
  reply_style?: ReplyStyle;
  sync?: SyncConfig;
  data_provider?: string;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummaryAccount {
  account_id: string;
  platform: Platform;
  connector: Connector;
  display_name: string;
  workspace: string;
  secret_envs: string[];
  secrets_ready: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  reply_style: ReplyStyle | null;
  sync: SyncConfig | null;
  accounts: ConfigSummaryAccount[];
}

// Argument to queueReply / decideReply.
export interface QueueReplyInput {
  conversation_id: string;
  text: string;
  note?: string;
  suggested_by?: string;
}

export interface DecideReplyInput {
  reply_id: string;
  action: string;
  comment?: string;
  text?: string;
}
