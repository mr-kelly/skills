// Core domain types shared across the kelly-standup server, store, demo, and
// scripts. These model the ACTUAL shapes produced by demo.ts / store.ts and the
// normalized snapshot documented in references/standup-schema.md.

export type UpdateSource = "slack" | "wecom" | "discord" | "whatsapp" | "doc" | "manual";
export type Mood = "good" | "ok" | "stuck" | "";
export type Severity = "high" | "medium" | "low";
export type BlockerStatus = "open" | "resolved";
export type ReminderStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type ReminderType = "missing_checkin" | "blocker_escalation";
export type ReminderChannel = "slack" | "wecom" | "discord" | "whatsapp" | "email";
export type Workday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Team {
  name: string;
  timezone: string;
  workdays: string[];
}

export interface Member {
  member_id: string;
  name: string;
  role: string;
  timezone: string;
  channel: string;
  active: boolean;
  streak: number;
  participation_30d: number;
  open_blockers: number;
  last_submitted_date: string;
  notes: string;
}

export interface Blocker {
  blocker_id: string;
  member_id: string;
  raised_date: string;
  severity: Severity | string;
  status: BlockerStatus | string;
  text: string;
  suggested_action: string;
  resolved_date: string;
}

export interface UpdateBlocker {
  blocker_id: string;
  text: string;
  severity: Severity | string;
  status: BlockerStatus | string;
}

export interface Update {
  member_id: string;
  yesterday: string[];
  today: string[];
  blockers: UpdateBlocker[];
  mood: Mood | string;
  submitted_at: string;
  source: UpdateSource | string;
  raw_excerpt: string;
}

export interface Participation {
  submitted: number;
  expected: number;
  on_leave: number;
}

export interface Day {
  date: string;
  digest: string;
  on_leave: string[];
  updates: Update[];
  participation: Participation;
}

export interface ReminderDecision {
  action: string;
  note: string;
  draft: string | null;
  decided_at: string;
}

export interface ReminderOperation {
  operation: string;
  channel: string;
  target: string;
  contact_env: string;
  contact_ready: boolean;
  message_draft: string;
}

export interface ReminderExecution {
  status: string;
  operations: ReminderOperation[];
  detail: string;
  executed_at: string;
}

export interface Reminder {
  id: string;
  ref: number;
  type: ReminderType | string;
  member_id: string;
  channel: ReminderChannel | string;
  title: string;
  reason: string;
  draft: string;
  status: ReminderStatus | string;
  created_at: string;
  decision: ReminderDecision | null;
  execution: ReminderExecution | null;
}

export interface SyncLogEntry {
  at: string;
  source: string;
  action: string;
  detail: string;
  count?: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
}

export interface Metrics {
  member_count: number;
  active_member_count: number;
  submitted_today: number;
  expected_today: number;
  on_leave_today: number;
  missing_today: number;
  open_blockers: number;
  high_open_blockers: number;
  reminders_needs_review: number;
  avg_participation_30d: number;
}

export interface StandupSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  team: Team;
  today: string;
  members: Member[];
  days: Day[];
  blockers: Blocker[];
  reminders: Reminder[];
  metrics: Metrics | Record<string, number>;
  sync_log: SyncLogEntry[];
  warnings: Warning[];
}

// ---- Config (as it appears in store.ts / scripts) ----

export interface ConfigMember {
  member_id: string;
  name?: string;
  role?: string;
  timezone?: string;
  channel?: string;
  active?: boolean;
  contact_env?: string;
  notes?: string;
}

export interface Config {
  team?: {
    name?: string;
    timezone?: string;
    workdays?: string[];
  };
  members?: ConfigMember[];
  standup_questions?: string[];
  digest?: { style?: string };
  data_provider?: string;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummaryMember {
  member_id: string;
  name: string;
  role: string;
  timezone: string;
  channel: string;
  active: boolean;
  contact_env: string;
  contact_ready: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  team: {
    name: string;
    timezone: string;
    workdays: string[];
  };
  members: ConfigSummaryMember[];
  standup_questions: string[];
  digest_style: string;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

export interface Decisions {
  updated_at: string;
  decisions: Record<string, ReminderDecision>;
}

export interface AgentTask {
  id: string;
  ref?: number;
  title?: string;
  type: string;
  note?: string;
  requested_at?: string;
}

export interface AgentTasks {
  updated_at: string;
  tasks: AgentTask[];
}

export interface ExecutionResult {
  id: string;
  ref?: number;
  title?: string;
  member_id: string;
  operations: ReminderOperation[];
  status: string;
  detail: string;
}

export interface ExecutionReport {
  generated_at: string;
  dry_run?: boolean;
  source: string;
  config_path?: string;
  results: ExecutionResult[];
}

// Demo/state query string (?demo=<scene>&lang=zh).
export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}
