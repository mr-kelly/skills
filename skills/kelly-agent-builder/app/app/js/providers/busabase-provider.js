import {
  activateAgent as activateAgentRule,
  applyUpdate,
  archiveAgent as archiveAgentRule,
  createAgent as createAgentRule,
  missingRequiredFields,
  pauseAgent as pauseAgentRule,
  summarize,
  toView,
} from "../agent-model.js?v=0.1.0";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import { TOOL_CATALOG } from "../tool-catalog.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordToAgent(row) {
  return {
    id: row.agent_id || "",
    name: row.name || "",
    trigger_description: row.trigger_description || "",
    allowed_tools: parseJsonList(row.allowed_tools),
    approval_required: row.approval_required === "true" || row.approval_required === true,
    monthly_quota: Number(row.monthly_quota || 0),
    calls_this_month: Number(row.calls_this_month || 0),
    owning_team: row.owning_team || "",
    status: row.status || "draft",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

function agentToFields(agent) {
  return {
    agent_id: agent.id,
    name: agent.name,
    trigger_description: agent.trigger_description,
    allowed_tools: JSON.stringify(agent.allowed_tools || []),
    approval_required: String(Boolean(agent.approval_required)),
    monthly_quota: agent.monthly_quota,
    calls_this_month: agent.calls_this_month,
    owning_team: agent.owning_team,
    status: agent.status,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
  };
}

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

async function readAllRecords(key, { maxPages = 20 } = {}) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const rows = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await runtimeClient.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const existing = await findRecord(key, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  const autoMerge = isStandaloneLocalRuntime();
  if (!existing) {
    return runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: appConfig.appId,
      autoMerge,
    });
  }
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge,
  });
}

async function readSettingsRows() {
  const rows = await readAllRecords("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

async function readAgents() {
  const rows = await readAllRecords("agents");
  return rows.map(recordToAgent);
}

async function writeAgent(agent, message) {
  await upsert("agents", "agent-id", agent.id, agentToFields(agent), message);
  return agent;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [agents, settings] = await Promise.all([readAgents(), readSettingsRows()]);
    const onboardingRow = settings.get("kelly-agent-builder-onboarding") || {};
    const lockRow = settings.get("kelly-agent-builder-lock") || {};
    return {
      app: "kelly-agent-builder",
      data_provider: "busabase",
      onboarding: { completed: Boolean(onboardingRow.record_id), config_version: "1" },
      config_summary: { config_path: "busabase:base/kelly-agent-builder-settings-v1", is_example: false },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      summary: summarize(agents),
      agents: agents.map(toView),
      tools: TOOL_CATALOG,
    };
  },

  async createAgent(input) {
    await ensureResources();
    const agents = await readAgents();
    const agent = createAgentRule(agents, input);
    await writeAgent(agent, `Create agent config ${agent.name || agent.id}`);
    return toView(agent);
  },

  async updateAgent(id, input) {
    await ensureResources();
    const agents = await readAgents();
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
    if (agent.status === "archived") {
      throw Object.assign(new Error("archived_agents_are_read_only"), { status: 409 });
    }
    const updated = applyUpdate(agent, input);
    if (updated.status === "live") {
      const missing = missingRequiredFields(updated);
      if (missing.length) {
        throw Object.assign(new Error("missing_required_fields"), { status: 422, missing_fields: missing });
      }
    }
    await writeAgent(updated, `Update agent config ${updated.name || updated.id}`);
    return toView(updated);
  },

  async activateAgent(id) {
    await ensureResources();
    const agents = await readAgents();
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
    const result = activateAgentRule(agent);
    if (!result.ok) {
      throw Object.assign(new Error(result.reason), { status: 422, missing_fields: result.missing_fields || [] });
    }
    await writeAgent(result.agent, `Activate agent config ${result.agent.name || result.agent.id}`);
    return toView(result.agent);
  },

  async pauseAgent(id) {
    await ensureResources();
    const agents = await readAgents();
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
    if (agent.status !== "live") {
      throw Object.assign(new Error("only_live_agents_can_be_paused"), { status: 409 });
    }
    const next = pauseAgentRule(agent);
    await writeAgent(next, `Pause agent config ${next.name || next.id}`);
    return toView(next);
  },

  async archiveAgent(id) {
    await ensureResources();
    const agents = await readAgents();
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
    const next = archiveAgentRule(agent);
    await writeAgent(next, `Archive agent config ${next.name || next.id}`);
    return toView(next);
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
