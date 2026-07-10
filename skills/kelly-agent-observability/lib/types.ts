// Core domain types shared across the kelly-agent-observability server and
// scripts. These model a mock fleet of LLM agents running behind a shared AI
// gateway for a generic organization. No real company or brand is referenced.

export type AgentStatus = "healthy" | "degraded" | "critical";
export type StepStatus = "ok" | "error";

export interface AgentDefinition {
  agent_id: string;
  name: string;
  description: string;
}

export interface HourlyBucket {
  hour: string; // ISO timestamp, start of hour
  calls: number;
  errors: number;
}

export interface AgentMetrics {
  agent_id: string;
  status: AgentStatus;
  calls_24h: number;
  calls_48h: number;
  error_rate_pct: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  cost_per_call_usd: number;
  cost_today_usd: number;
  cost_7d_usd: number;
  hourly: HourlyBucket[];
}

export interface TraceStep {
  step_id: string;
  name: string;
  duration_ms: number;
  status: StepStatus;
  detail?: string;
}

export interface Trace {
  trace_id: string;
  agent_id: string;
  started_at: string;
  duration_ms: number;
  status: StepStatus;
  cost_usd: number;
  broke_at_step_id?: string;
  steps: TraceStep[];
}

export interface FleetSummary {
  generated_at: string;
  total_calls_24h: number;
  total_cost_today_usd: number;
  degraded_agent_count: number;
  critical_agent_count: number;
  healthy_agent_count: number;
  agent_count: number;
}

export interface FleetData {
  schema_version: string;
  generated_at: string;
  agents: AgentDefinition[];
  metrics: AgentMetrics[];
  traces: Trace[];
}

export type HandoffTargetType = "agent" | "trace";
export type HandoffStatus = "acknowledged" | "needs_investigation";

export interface Handoff {
  handoff_id: string;
  target_type: HandoffTargetType;
  target_id: string;
  agent_id: string;
  status: HandoffStatus;
  note: string;
  created_at: string;
  created_by: string;
}
