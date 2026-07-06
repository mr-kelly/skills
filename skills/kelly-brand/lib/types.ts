// Shared types for the kelly-brand data-provider layer and scripts. These model
// the ACTUAL shapes flowing through lib/data-provider/*.ts and the scripts — a
// brand-narrative review workflow (snapshot -> items/drift -> decisions ->
// execution report).

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

// Result of loadConfig(); passed to each provider factory.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// A human verdict on a narrative item or drift alert.
export interface DecisionInput {
  item_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

export interface DecisionRecord {
  action: string;
  comment: string;
  draft?: string;
  decided_at: string;
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, DecisionRecord>;
}

export interface AgentTask {
  task_id: string;
  type: string;
  item_id: string;
  comment: string;
  draft?: string;
  requested_at: string;
  status: string;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: AgentTask[];
}

export interface OnboardingMarker {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

// Loose brand-narrative snapshot. The strict shape is validated by
// scripts/validate_ui_schema.ts; here it is just a JSON record.
export type Snapshot = Record<string, unknown>;

// The aggregate `/api/state` inner payload (everything under `app`).
export interface BrandState {
  data_provider: string;
  onboarding: OnboardingMarker;
  lock: unknown;
  config_summary: Record<string, unknown>;
  decisions: DecisionsFile;
  agent_tasks: AgentTasksFile;
  execution_report: unknown;
  snapshot: Snapshot;
}
