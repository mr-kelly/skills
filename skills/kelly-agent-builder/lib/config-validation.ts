// Pure governance rules shared by the server (store.ts) and scripts
// (generate_demo_snapshot.ts / validate_ui_schema.ts). No fs, no side effects — every
// function here takes plain data in and returns plain data out.

import type { AgentConfig, AgentDerived } from "../app/server/types.ts";
import { isKnownTool } from "./tool-catalog.ts";

// Required for draft -> live: name, trigger_description, >=1 allowed tool,
// owning_team non-empty, monthly_quota > 0.
export function missingRequiredFields(agent: AgentConfig): string[] {
  const missing: string[] = [];
  if (!agent.name?.trim()) missing.push("name");
  if (!agent.trigger_description?.trim()) missing.push("trigger_description");
  if (!Array.isArray(agent.allowed_tools) || agent.allowed_tools.length === 0) missing.push("allowed_tools");
  if (!agent.owning_team?.trim()) missing.push("owning_team");
  if (!(Number(agent.monthly_quota) > 0)) missing.push("monthly_quota");
  return missing;
}

export function isOverQuota(agent: AgentConfig): boolean {
  return agent.status === "live" && agent.monthly_quota > 0 && agent.calls_this_month >= agent.monthly_quota;
}

// needs_attention = draft with missing required fields, OR missing owner, OR
// over-quota, OR (approval_required true with no owner assigned).
export function deriveAgent(agent: AgentConfig): AgentDerived {
  const missing = missingRequiredFields(agent);
  const overQuota = isOverQuota(agent);
  const missingOwner = !agent.owning_team?.trim();
  const reasons: string[] = [];
  if (agent.status === "draft" && missing.length) reasons.push("draft_incomplete");
  if (missingOwner) reasons.push("missing_owner");
  if (overQuota) reasons.push("over_quota");
  if (agent.approval_required && missingOwner) reasons.push("approval_without_owner");
  const usagePct = agent.monthly_quota > 0 ? Math.round((agent.calls_this_month / agent.monthly_quota) * 1000) / 10 : 0;
  return {
    is_over_quota: overQuota,
    usage_pct: usagePct,
    needs_attention: reasons.length > 0,
    attention_reasons: [...new Set(reasons)],
    missing_required_fields: missing,
  };
}

export function sanitizeTools(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return [...new Set(tools.filter((t): t is string => typeof t === "string" && isKnownTool(t)))];
}
