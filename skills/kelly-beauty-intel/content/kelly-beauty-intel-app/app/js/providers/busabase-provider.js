import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildBatch, statusForAction } from "../intel-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

// Item-kind -> Base key + Busabase id field slug + app id field.
const KIND_TO_BASE = {
  signal: { baseKey: "signals", idFieldSlug: "signal-id", idKey: "signal_id" },
  action: { baseKey: "actions", idFieldSlug: "action-id", idKey: "action_id" },
  draft: { baseKey: "drafts", idFieldSlug: "draft-id", idKey: "draft_id" },
};

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

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

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({
      baseId: base(key).baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

const countStatus = (key, status) =>
  countRecords(key, [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }]);

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
  const { rows } = await readPage("settings");
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

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [
      signals,
      actions,
      drafts,
      sources,
      settings,
      signalCount,
      actionCount,
      draftCount,
      sourceCount,
      ...statusCounts
    ] = await Promise.all([
      readPage("signals"),
      readPage("actions"),
      readPage("drafts"),
      readPage("sources"),
      readSettingsRows(),
      countRecords("signals"),
      countRecords("actions"),
      countRecords("drafts"),
      countRecords("sources"),
      ...["signals", "actions", "drafts"].flatMap((key) =>
        ["needs_review", "approved", "blocked", "changes_requested"].map((status) => countStatus(key, status)),
      ),
    ]);
    const batch = buildBatch({
      signals: signals.rows,
      actions: actions.rows,
      drafts: drafts.rows,
      sources: sources.rows,
    });
    const brandRow = settings.get("kelly-beauty-intel-brand") || {};
    const lockRow = settings.get("kelly-beauty-intel-lock") || {};
    const brandPayload = parsePayload(brandRow.payload);
    const exactWorkflowCounts = statusCounts.every((value) => value !== null)
      ? {
          needs: statusCounts[0] + statusCounts[4] + statusCounts[8],
          approved: statusCounts[1] + statusCounts[5] + statusCounts[9],
          blocked:
            statusCounts[2] + statusCounts[3] + statusCounts[6] + statusCounts[7] + statusCounts[10] + statusCounts[11],
        }
      : null;
    return {
      app: "kelly-beauty-intel",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(brandRow.record_id), config_version: "1" },
      config_summary: {
        source: "busabase:base/kelly-beauty-intel-settings",
        brand: brandPayload.brand_name || "not configured",
        provider: "busabase",
        channels: Array.isArray(brandPayload.channels) ? brandPayload.channels : [],
      },
      locked: Boolean(lockRow.locked),
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      files: {},
      batch,
      decisions: {},
      pagination: {
        signals: signals.nextCursor,
        actions: actions.nextCursor,
        drafts: drafts.nextCursor,
        sources: sources.nextCursor,
      },
      totalCount: { signals: signalCount, actions: actionCount, drafts: draftCount, sources: sourceCount },
      workflowCount: exactWorkflowCounts,
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  async applyDecision(kind, id, payload = {}) {
    const target = KIND_TO_BASE[kind];
    if (!target) throw new Error(`Unsupported item kind: ${kind}`);
    const action = String(payload.action || "");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const existing = await findRecord(target.baseKey, target.idFieldSlug, id);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      [target.idKey]: id,
      status: statusForAction(action),
      decision_note: String(payload.note || ""),
      decided_at: now,
      ...(kind === "draft" && payload.edited_body !== undefined ? { body: String(payload.edited_body) } : {}),
    };
    await upsert(target.baseKey, target.idFieldSlug, id, fields, `Decision on ${kind} ${id}: ${action}`);
    return { ok: true };
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
