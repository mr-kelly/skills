import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, decisionsFromSnapshot, statusForAction } from "../crm-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. Human verdicts
// made from a standalone local preview (the trusted operator's own machine)
// merge immediately; verdicts made from the deployed AirApp create a pending
// ChangeRequest for the trusted process to merge, per the AirApp boundary.
const isStandaloneLocalRuntime = () => {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
};

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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
    const names = resources.missing.map((base) => base.name).join("、");
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

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function configSummary(operatorPayload, channelsPayload) {
  const channels = Array.isArray(channelsPayload.channels) ? channelsPayload.channels : [];
  return {
    config_path: "busabase:base/kelly-crm-settings-v1",
    is_example: false,
    operator: {
      name: operatorPayload.name || "",
      role: operatorPayload.role || "",
      company: operatorPayload.company || "",
      timezone: operatorPayload.timezone || "",
    },
    pipeline_stages: Array.isArray(operatorPayload.pipeline_stages) ? operatorPayload.pipeline_stages : undefined,
    base_currency: operatorPayload.base_currency || "USD",
    style_tone: operatorPayload.style_tone || "",
    channels: channels.map((channel) => ({
      channel_id: channel.channel_id || "",
      type: channel.type || "",
      display_name: channel.display_name || channel.channel_id || "",
      handoff_skill: channel.handoff_skill || "",
      secrets_ready: Boolean(channel.vault_ref),
    })),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [companies, contacts, deals, interactions, followups, settings] = await Promise.all([
      readAllRecords("companies"),
      readAllRecords("contacts"),
      readAllRecords("deals"),
      readAllRecords("interactions"),
      readAllRecords("followups"),
      readSettingsRows(),
    ]);
    const snapshot = buildSnapshot({ companies, contacts, deals, interactions, followups });
    const operatorRow = settings.get("kelly-crm-operator") || {};
    const channelsRow = settings.get("kelly-crm-channels") || {};
    const lockRow = settings.get("kelly-crm-lock") || {};
    const operatorPayload = parsePayload(operatorRow.payload);
    const channelsPayload = parsePayload(channelsRow.payload);
    const summary = configSummary(operatorPayload, channelsPayload);
    if (summary.pipeline_stages === undefined) summary.pipeline_stages = snapshot.pipeline_stages;
    return {
      app: "kelly-crm",
      data_provider: "busabase",
      onboarding: { completed: Boolean(operatorRow.record_id), config_version: "1" },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      config_summary: summary,
      decisions: decisionsFromSnapshot(snapshot),
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  },

  async readLock() {
    const settings = await readSettingsRows();
    const lockRow = settings.get("kelly-crm-lock") || {};
    return lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null;
  },

  async applyDecision(payload = {}) {
    const followupId = String(payload.followup_id || "");
    const action = String(payload.action || "");
    if (!followupId) throw new Error("followup_id is required");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    const lock = await this.readLock();
    if (lock) throw new Error(lock.message || "Agent lock is active; the queue is read-only right now.");
    await ensureResources();
    const nextStatus = statusForAction(action);
    const now = new Date().toISOString();
    const fields = {
      status: nextStatus,
      decision_comment: String(payload.comment || ""),
      decided_at: now,
      decided_by: "operator",
      ...(payload.draft !== undefined ? { suggested_reply: String(payload.draft) } : {}),
    };
    await upsert(
      "followups",
      "followup-id",
      followupId,
      { followup_id: followupId, ...fields },
      `Decision on follow-up ${followupId}: ${action}`,
    );
    return { updated_at: now, decisions: { [followupId]: { action, decided_at: now } } };
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
