// Core domain types shared across the kelly-tickets server, scripts, and demo
// builder. These model the ACTUAL shapes produced by demo.ts / store.ts and the
// snapshot documented in references/tickets-schema.md.

export type Channel = "wechat" | "phone" | "form" | "email" | "walk_in";
export type Urgency = "urgent" | "high" | "normal" | "low";
export type TriageState = "new" | "classified" | "ticketed" | "ignored";
export type TicketStatus = "open" | "assigned" | "in_progress" | "waiting" | "resolved";
export type ProposalStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type SlaState = "ok" | "at_risk" | "breached" | "met";
export type Priority = "P1" | "P2" | "P3" | "P4";

export interface Crew {
  crew_id: string;
  name: string;
  skills: string[];
  members?: string | number;
  contact_env?: string;
  open_tickets?: number;
  active?: boolean;
}

export interface IntakeItem {
  id: string;
  channel: Channel | string;
  external_id: string;
  content_hash: string;
  reporter: string;
  contact_masked: string;
  unit: string;
  location: string;
  text: string;
  received_at: string;
  urgency_guess: Urgency | string;
  category_guess: string;
  triage_state: TriageState | string;
  ticket_id: string;
  attachments_note: string;
  decision?: Decision | null;
}

export interface TicketEvent {
  event: string;
  actor: string;
  at: string;
  note: string;
}

export interface Ticket {
  id: string;
  title: string;
  category: string;
  urgency: Urgency | string;
  unit: string;
  location: string;
  reporter: string;
  contact_masked: string;
  status: TicketStatus | string;
  crew_id: string;
  assignee: string;
  created_at: string;
  updated_at: string;
  resolved_at: string;
  sla_due_at: string;
  sla_state: SlaState | string;
  intake_ids: string[];
  resolution_note: string;
  history: TicketEvent[];
  decision?: Decision | null;
}

export interface Decision {
  action: string;
  note?: string;
  draft?: string | null;
  fields?: Record<string, unknown> | null;
  decided_at?: string;
}

export interface ExecutionOperation {
  operation: string;
  target: string;
  detail?: string;
  [key: string]: unknown;
}

export interface ProposalExecution {
  status: string;
  operations: ExecutionOperation[];
  detail: string;
  executed_at: string;
}

export interface DispatchProposal {
  id: string;
  ref: number;
  ticket_id: string;
  title: string;
  summary: string;
  proposed_crew_id: string;
  proposed_assignee: string;
  priority: Priority | string;
  sla_due_at: string;
  sla_hours: number;
  reason: string;
  note_to_crew: string;
  status: ProposalStatus | string;
  decision?: Decision | null;
  execution?: ProposalExecution | null;
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
  ticket_id?: string;
  detail?: string;
}

export interface Metrics {
  intake_count: number;
  unclassified_intake: number;
  ticket_count: number;
  open_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number;
  sla_at_risk: number;
  proposal_count: number;
  needs_review: number;
  intake_by_channel: Record<string, number>;
}

export interface Property {
  name: string;
  buildings: number;
  timezone?: string;
}

export interface Snapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  property: Property;
  range: { start: string; end: string };
  metrics: Metrics | Record<string, never>;
  intake: IntakeItem[];
  tickets: Ticket[];
  dispatch_proposals: DispatchProposal[];
  crews: Crew[];
  sync_log: SyncLogEntry[];
  warnings: Warning[];
}

// ---- Config (as it appears in store.ts) ----

export interface SlaRule {
  category: string;
  urgency: string;
  hours: number;
}

export interface Config {
  data_provider?: string;
  property?: Property;
  channels?: string[];
  categories?: string[];
  crews?: Crew[];
  sla_rules?: SlaRule[];
  sla_default_hours?: number;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  property: { name: string; buildings: number; timezone: string };
  channels: string[];
  categories: string[];
  crews: Array<{
    crew_id: string;
    name: string;
    skills: string[];
    contact_env: string;
    contact_ready: boolean;
  }>;
  sla_rules: SlaRule[];
  sla_default_hours: number;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface AgentTask {
  id: string;
  title?: string;
  ref?: number;
  type: string;
  note?: string;
  fields?: Record<string, unknown> | null;
  requested_at: string;
}

export interface AgentTasks {
  updated_at: string;
  tasks: AgentTask[];
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

export interface Lock {
  owner: string;
  message?: string;
  started_at: string;
}

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}
