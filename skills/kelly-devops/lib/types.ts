// Shared types for the kelly-devops data-provider layer.
//
// The domain shapes (DevopsSnapshot, OpsAction, Config, …) are already modeled
// authoritatively in app/server/types.ts. This module re-exports them so
// provider code has one import surface, and adds the provider-layer types
// (config selection, provider metadata, HTTP-status errors, the agent-task
// queue) that the store used to carry inline.

export type {
  ActionStatus,
  ActionTarget,
  ActionType,
  BusabaseConfig,
  Config,
  ConfigBillingSource,
  ConfigDomain,
  ConfigKeyRotation,
  ConfigProduct,
  ConfigResult,
  ConfigService,
  ConfigSummary,
  Decision,
  DecisionsFile,
  DevopsSnapshot,
  Domain,
  Expiry,
  ExpiryType,
  EventSeverity,
  HistoryEntry,
  Lock,
  Metrics,
  Onboarding,
  OpsAction,
  OpsEvent,
  Service,
  ServiceMeta,
  ServiceStatus,
  SnapshotChecks,
  SnapshotWarning,
  Spend,
  SpendProduct,
  SpendProvider,
  SslCert,
  Thresholds,
  Verdict,
} from "../app/server/types.ts";

import type { Config } from "../app/server/types.ts";

// Result of loadConfig() in data-provider/index.ts; passed to each provider.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by providers and read by Hono.
// Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}

// An item the agent should act on after a request_changes verdict. Mirrors the
// shape store.ts wrote into app/.data/agent_tasks.json.
export interface AgentTask {
  task_id: string;
  action_id: string;
  type: string;
  title: string;
  request: string;
  status: string;
  created_at: string;
}

export interface AgentTasksFile {
  tasks: AgentTask[];
  updated_at?: string;
}

// Input to applyDecision(): a human verdict on one action card.
export interface DecisionInput {
  action_id?: string;
  verdict?: string;
  note?: string;
  [key: string]: unknown;
}

// The aggregate /api/state payload (real mode; demo mode is served separately).
export interface DevopsState {
  app: string;
  data_provider: string;
  onboarding: import("../app/server/types.ts").Onboarding;
  lock: import("../app/server/types.ts").Lock | null;
  config_summary: import("../app/server/types.ts").ConfigSummary;
  snapshot: import("../app/server/types.ts").DevopsSnapshot;
}
