// Domain types live in lib/data-provider/provider-interface.ts (the shared
// contract). This module re-exports them for server code, and adds the
// server-only derived/view shapes that are never persisted.

export type {
  AgentConfig,
  AgentsFile,
  AgentStatus,
  Config,
  ConfigResult,
  Onboarding,
} from "../../lib/data-provider/provider-interface.ts";

import type { AgentConfig } from "../../lib/data-provider/provider-interface.ts";

// Derived, read-only view of an AgentConfig computed by store.ts. Never
// persisted; always recomputed from the raw record.
export interface AgentDerived {
  is_over_quota: boolean;
  usage_pct: number;
  needs_attention: boolean;
  attention_reasons: string[];
  missing_required_fields: string[];
}

export interface AgentView extends AgentConfig {
  derived: AgentDerived;
}

export interface GovernanceSummary {
  total: number;
  live_count: number;
  draft_count: number;
  paused_count: number;
  archived_count: number;
  over_quota_count: number;
  needs_attention_count: number;
  total_quota: number;
  total_calls: number;
  usage_pct: number;
}

export interface CreateAgentInput {
  name?: string;
  trigger_description?: string;
  allowed_tools?: string[];
  approval_required?: boolean;
  monthly_quota?: number;
  owning_team?: string;
}

export type UpdateAgentInput = Partial<CreateAgentInput>;
