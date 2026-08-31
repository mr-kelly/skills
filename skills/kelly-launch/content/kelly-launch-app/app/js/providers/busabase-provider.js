import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, statusForAction } from "../launch-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
let currentPageContext = {};

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

const initialPageCursors = {};
const initialTotalCounts = {};

async function readFirstPage(key) {
  const [{ rows, nextCursor }, total] = await Promise.all([readPage(key), countRecords(key)]);
  initialPageCursors[key] = nextCursor;
  initialTotalCounts[key] = total;
  return rows;
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({ baseId: declared.baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

function normalizePageRows(key, rows) {
  const snapshotKey = key.replaceAll("-", "_");
  currentPageContext = { ...currentPageContext, [snapshotKey]: rows };
  const snapshot = buildSnapshot(currentPageContext);
  return snapshot[snapshotKey] || rows;
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
  const rows = await readFirstPage("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function withPagination(data) {
  return {
    ...data,
    pagination: { ...initialPageCursors },
    totals: { ...initialTotalCounts },
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    for (const key of Object.keys(initialPageCursors)) delete initialPageCursors[key];
    for (const key of Object.keys(initialTotalCounts)) delete initialTotalCounts[key];
    await ensureResources();
    const [items, channels, runbook, settings] = await Promise.all([
      readFirstPage("items"),
      readFirstPage("channels"),
      readFirstPage("runbook"),
      readSettingsRows(),
    ]);
    currentPageContext = { items, channels, runbook };
    const snapshot = buildSnapshot(currentPageContext);
    const profileRow = settings.get("kelly-launch-profile") || {};
    const lockRow = settings.get("kelly-launch-lock") || {};
    const profile = parsePayload(profileRow.payload);
    snapshot.product = profile.product || snapshot.product;
    snapshot.launch = profile.launch || snapshot.launch;
    return withPagination({
      app: "kelly-launch",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(profileRow.record_id), config_version: "1" },
      config_summary: {
        config_path: "busabase:base/kelly-launch-settings",
        is_example: false,
        product: profile.product || {},
        launch: profile.launch || {},
        style_tone: profile.style_tone || "",
        press_lists: profile.press_lists || [],
        readiness_policy: profile.readiness_policy || {},
        channels: profile.channels || [],
      },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      decisions: {},
      snapshot,
    });
  },

  async applyDecision(itemId, payload = {}) {
    const action = String(payload.action || "");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const existing = await findRecord("items", "item-id", itemId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      item_id: itemId,
      status: statusForAction(action),
      decision_note: String(payload.comment || ""),
      decided_at: now,
      ...(payload.draft !== undefined ? { draft: String(payload.draft) } : {}),
    };
    await upsert("items", "item-id", itemId, fields, `Decision on item ${itemId}: ${action}`);
    return { ok: true };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    return { ...page, rows: normalizePageRows(key, page.rows) };
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
