import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  VALID_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  computeCheckFromRow,
  computeModelFromRow,
  statusForAction,
} from "../finance-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

export const isStandaloneLocalRuntime = () => {
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

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields).
function baseCheckFields(row) {
  return {
    check_id: row.check_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    check_type: row.check_type,
    evidence: row.evidence || "",
    proposed_action: row.proposed_action,
    draft: row.draft || "",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
  };
}

function findModelRow(rows = []) {
  return rows.find((row) => row.model_id === "current") || rows[0] || null;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [modelRows, checkRows, settingsRows] = await Promise.all([
      readAllRecords("model"),
      readAllRecords("checks"),
      readAllRecords("settings"),
    ]);
    const config_summary = buildConfigSummary(settingsRows);
    const modelRow = findModelRow(modelRows);
    const checks = checkRows.map(computeCheckFromRow);
    const snapshot = assembleSnapshot({
      model: modelRow ? computeModelFromRow(modelRow) : null,
      checks,
    });
    return {
      app: "kelly-finance",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(modelRow), config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict (approve / request_changes / block / dismiss), written
  // directly onto the check record. Ported from the retired local-file
  // DataProvider's applyDecision(): the check's decision action/comment/
  // decided_at all live on the same row — there is no separate
  // decisions.json bucket.
  async submitReview({ id, action, comment = "", draft = "" } = {}) {
    if (!id || typeof id !== "string") throw new Error("submitReview requires an id");
    if (!action || !VALID_ACTIONS.has(action)) {
      throw new Error(`Unknown decision action: ${action}. Must be one of: ${[...VALID_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("checks", "check-id", id);
    if (!existing) throw new Error(`Model check not found: ${id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const status = statusForAction(action) || current.status;
    const fields = {
      ...baseCheckFields(current),
      check_id: id,
      status,
      draft: draft || current.draft || "",
      decision_action: action,
      decision_comment: String(comment || ""),
      decided_at: now,
    };
    await upsert("checks", "check-id", id, fields, `Decision on model check ${id}: ${action}`);
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
