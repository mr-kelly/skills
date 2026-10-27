import {
  createAirAppRecords,
  inspectProvisionedResources,
  provisionDeclaredResources,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { VERDICTS, buildConfigSummary, buildSnapshot, statusForVerdict } from "../devops-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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

// Record reads and writes go through the SDK's helpers, bound to this app's client.
// A person's write leaves `autoMerge` unset, so Busabase decides from their own
// permission: it lands now with write access and becomes a ChangeRequest without
// it. The response says which happened; `isAirAppWriteQueued` reads it.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
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
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const { response } = await sdkRecords().upsert({
    baseId: declared.baseId,
    fieldSlug: idFieldSlug,
    valueText: idValue,
    fields: toBusabaseFields(fields),
    message,
  });
  return response;
}

async function readSettingsRow() {
  const rows = await readFirstPage("settings");
  return rows.find((row) => row.record_id === "config") || {};
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
    const [services, expiries, spend_providers, spend_products, actions, events, settings] = await Promise.all([
      readFirstPage("services"),
      readFirstPage("expiries"),
      readFirstPage("spend-providers"),
      readFirstPage("spend-products"),
      readFirstPage("actions"),
      readFirstPage("events"),
      readSettingsRow(),
    ]);
    currentPageContext = { services, expiries, spend_providers, spend_products, actions, events, settings };
    const snapshot = buildSnapshot(currentPageContext);
    const config_summary = buildConfigSummary({ services, expiries: snapshot.expiries, settings });
    return withPagination({
      app: "kelly-devops",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: services.length > 0 || expiries.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    });
  },

  // Human verdict on an action card, written directly onto the action
  // record. Ported from the retired local-file DataProvider's
  // applyDecision(): "done" is terminal (the agent already executed this
  // action outside the app via scripts/execute_decisions.mjs --complete) and
  // cannot be re-decided from the review queue.
  async decideAction({ action_id, verdict, note = "" } = {}) {
    if (!action_id || typeof action_id !== "string") throw new Error("action_id is required");
    if (!verdict || !VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
    await ensureResources();
    const existing = await findRecord("actions", "action-id", action_id);
    if (!existing) throw new Error(`Unknown action: ${action_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    if (current.status === "done") throw new Error(`Action ${action_id} is already done and cannot be re-decided`);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      action_id,
      status: statusForVerdict(verdict, current.status || "needs_review"),
      note: typeof note === "string" ? note : current.note || "",
      ...(verdict === "note" ? {} : { decision_verdict: verdict, decision_note: String(note || ""), decided_at: now }),
    };
    await upsert("actions", "action-id", action_id, fields, `Decision on action ${action_id}: ${verdict}`);
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
