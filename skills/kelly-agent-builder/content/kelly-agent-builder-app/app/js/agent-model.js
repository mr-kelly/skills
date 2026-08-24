// Pure governance rules and view/summary computation, ported from the
// pre-Busabase lib/config-validation.ts and app/server/store.ts. No fetch, no
// storage — every function here takes plain data in and returns plain data
// out, so the same rules apply whether the record came from Busabase or Demo.
import { isKnownTool } from "./tool-catalog.js";

// Required for draft -> live: name, trigger_description, >=1 allowed tool,
// owning_team non-empty, monthly_quota > 0.
export function missingRequiredFields(agent) {
  const missing = [];
  if (!agent.name?.trim()) missing.push("name");
  if (!agent.trigger_description?.trim()) missing.push("trigger_description");
  if (!Array.isArray(agent.allowed_tools) || agent.allowed_tools.length === 0) missing.push("allowed_tools");
  if (!agent.owning_team?.trim()) missing.push("owning_team");
  if (!(Number(agent.monthly_quota) > 0)) missing.push("monthly_quota");
  return missing;
}

export function isQuotaReached(agent) {
  return agent.status === "live" && agent.monthly_quota > 0 && agent.calls_this_month >= agent.monthly_quota;
}

// needs_attention = draft with missing required fields, OR missing owner, OR
// over-quota, OR (approval_required true with no owner assigned).
export function deriveAgent(agent) {
  const missing = missingRequiredFields(agent);
  const quotaReached = isQuotaReached(agent);
  const missingOwner = !agent.owning_team?.trim();
  const reasons = [];
  if (agent.status === "draft" && missing.length) reasons.push("draft_incomplete");
  if (missingOwner) reasons.push("missing_owner");
  if (quotaReached) reasons.push("quota_reached");
  if (agent.approval_required && missingOwner) reasons.push("approval_without_owner");
  const usagePct = agent.monthly_quota > 0 ? Math.round((agent.calls_this_month / agent.monthly_quota) * 1000) / 10 : 0;
  return {
    is_quota_reached: quotaReached,
    usage_pct: usagePct,
    needs_attention: reasons.length > 0,
    attention_reasons: [...new Set(reasons)],
    missing_required_fields: missing,
  };
}

export function sanitizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  return [...new Set(tools.filter((t) => typeof t === "string" && isKnownTool(t)))];
}

export function toView(agent) {
  return { ...agent, derived: deriveAgent(agent) };
}

export function summarize(agents) {
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

function nextId(agents) {
  const n = agents.length + 1;
  const id = `agent-${String(n).padStart(3, "0")}`;
  return agents.some((a) => a.id === id) ? `agent-${Date.now()}` : id;
}

export function createAgent(agents, input) {
  const now = new Date().toISOString();
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

export function applyUpdate(agent, input) {
  const next = { ...agent };
  if (input.name !== undefined) next.name = String(input.name).trim();
  if (input.trigger_description !== undefined) next.trigger_description = String(input.trigger_description).trim();
  if (input.allowed_tools !== undefined) next.allowed_tools = sanitizeTools(input.allowed_tools);
  if (input.approval_required !== undefined) next.approval_required = Boolean(input.approval_required);
  if (input.monthly_quota !== undefined) next.monthly_quota = Number(input.monthly_quota) || 0;
  if (input.owning_team !== undefined) next.owning_team = String(input.owning_team).trim();
  next.updated_at = new Date().toISOString();
  return next;
}

export function archiveAgent(agent) {
  return { ...agent, status: "archived", updated_at: new Date().toISOString() };
}

export function pauseAgent(agent) {
  return { ...agent, status: "paused", updated_at: new Date().toISOString() };
}

// Gate for draft -> live. Never trust the browser form for this check alone —
// the provider re-validates before writing.
export function activateAgent(agent) {
  if (agent.status === "archived") {
    return { ok: false, reason: "archived_agents_cannot_be_activated" };
  }
  const missing = missingRequiredFields(agent);
  if (missing.length) {
    return { ok: false, missing_fields: missing, reason: "missing_required_fields" };
  }
  return { ok: true, agent: { ...agent, status: "live", updated_at: new Date().toISOString() } };
}
