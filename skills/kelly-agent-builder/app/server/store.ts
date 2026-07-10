import { nowIso } from "../../lib/common.ts";
import { deriveAgent, isQuotaReached, missingRequiredFields, sanitizeTools } from "../../lib/config-validation.ts";
import { getProvider } from "../../lib/data-provider/index.ts";
import type {
  AgentConfig,
  AgentView,
  AgentsFile,
  ConfigResult,
  CreateAgentInput,
  GovernanceSummary,
  Onboarding,
  UpdateAgentInput,
} from "./types.ts";

// This module is the only place app/server code touches persistence, and it
// only ever goes through lib/data-provider — never node:fs directly — so the
// same logic can later run against a cloud provider (see Data Provider
// Spectrum in the app-in-skill-creator skill).

export async function ensureDirs(): Promise<void> {
  // No-op placeholder kept for launcher symmetry with other App-in-Skills;
  // the provider creates app/.data lazily on first write.
}

export async function readAgentsFile(): Promise<AgentsFile> {
  return getProvider().readAgentsFile();
}

export async function writeAgentsFile(file: AgentsFile): Promise<void> {
  await getProvider().writeAgentsFile(file);
}

export async function readOnboarding(): Promise<Onboarding> {
  return getProvider().readOnboarding();
}

export async function writeOnboarding(onboarding: Onboarding): Promise<void> {
  await getProvider().writeOnboarding(onboarding);
}

export async function readConfig(): Promise<ConfigResult> {
  return getProvider().readConfig();
}

export async function readLock(): Promise<unknown> {
  return getProvider().readLock();
}

export function toView(agent: AgentConfig): AgentView {
  return { ...agent, derived: deriveAgent(agent) };
}

export function summarize(agents: AgentConfig[]): GovernanceSummary {
  const views = agents.map(toView);
  // Archived/paused agents' quota is frozen, not "current" — only live agents
  // should count toward the dashboard-wide current usage figure.
  const liveAgents = agents.filter((a) => a.status === "live");
  const totalQuota = liveAgents.reduce((sum, a) => sum + Number(a.monthly_quota || 0), 0);
  const totalCalls = liveAgents.reduce((sum, a) => sum + Number(a.calls_this_month || 0), 0);
  return {
    total: agents.length,
    live_count: agents.filter((a) => a.status === "live").length,
    draft_count: agents.filter((a) => a.status === "draft").length,
    paused_count: agents.filter((a) => a.status === "paused").length,
    archived_count: agents.filter((a) => a.status === "archived").length,
    quota_reached_count: views.filter((v) => v.derived.is_quota_reached).length,
    needs_attention_count: views.filter((v) => v.derived.needs_attention).length,
    total_quota: totalQuota,
    total_calls: totalCalls,
    usage_pct: totalQuota > 0 ? Math.round((totalCalls / totalQuota) * 1000) / 10 : 0,
  };
}

function nextId(agents: AgentConfig[]): string {
  const n = agents.length + 1;
  const id = `agent-${String(n).padStart(3, "0")}`;
  return agents.some((a) => a.id === id) ? `agent-${Date.now()}` : id;
}

export function createAgent(agents: AgentConfig[], input: CreateAgentInput): AgentConfig {
  const now = nowIso();
  return {
    id: nextId(agents),
    name: String(input.name || "").trim(),
    trigger_description: String(input.trigger_description || "").trim(),
    allowed_tools: sanitizeTools(input.allowed_tools),
    approval_required: Boolean(input.approval_required),
    monthly_quota: Number(input.monthly_quota || 0),
    calls_this_month: 0,
    owning_team: String(input.owning_team || "").trim(),
    status: "draft",
    created_at: now,
    updated_at: now,
  };
}

export function applyUpdate(agent: AgentConfig, input: UpdateAgentInput): AgentConfig {
  const next: AgentConfig = { ...agent };
  if (input.name !== undefined) next.name = String(input.name).trim();
  if (input.trigger_description !== undefined) next.trigger_description = String(input.trigger_description).trim();
  if (input.allowed_tools !== undefined) next.allowed_tools = sanitizeTools(input.allowed_tools);
  if (input.approval_required !== undefined) next.approval_required = Boolean(input.approval_required);
  if (input.monthly_quota !== undefined) next.monthly_quota = Number(input.monthly_quota) || 0;
  if (input.owning_team !== undefined) next.owning_team = String(input.owning_team).trim();
  next.updated_at = nowIso();
  return next;
}

export function archiveAgent(agent: AgentConfig): AgentConfig {
  return { ...agent, status: "archived", updated_at: nowIso() };
}

export function pauseAgent(agent: AgentConfig): AgentConfig {
  return { ...agent, status: "paused", updated_at: nowIso() };
}

export interface ActivationResult {
  ok: boolean;
  agent?: AgentConfig;
  missing_fields?: string[];
  reason?: string;
}

// Server-side gate for draft -> live. Never trust the client for this check.
export function activateAgent(agent: AgentConfig): ActivationResult {
  if (agent.status === "archived") {
    return { ok: false, reason: "archived_agents_cannot_be_activated" };
  }
  const missing = missingRequiredFields(agent);
  if (missing.length) {
    return { ok: false, missing_fields: missing, reason: "missing_required_fields" };
  }
  return { ok: true, agent: { ...agent, status: "live", updated_at: nowIso() } };
}

export { isQuotaReached, missingRequiredFields, deriveAgent };
