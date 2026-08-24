import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { DECISION_ACTIONS, buildConfigSummary, buildSnapshot, statusForVerdict } from "../audit-model.js?v=0.1.0";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp sits inside the Busabase review boundary; only a standalone
// run may merge its own writes. That is far too consequential to infer from the
// URL — see ../runtime.js.
import { isStandaloneLocalRuntime } from "../runtime.js";

export { isStandaloneLocalRuntime };

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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
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

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields).
function baseAnomalyFields(row) {
  return {
    anomaly_id: row.anomaly_id,
    ref: row.ref,
    rule: row.rule,
    severity: row.severity,
    status: row.status,
    title: row.title,
    customer: row.customer || "",
    amount_at_stake: row.amount_at_stake,
    currency: row.currency || "USD",
    aging_bucket: row.aging_bucket || "",
    reason: row.reason || "",
    evidence: row.evidence || "",
    proposed_action: row.proposed_action || "",
    draft: row.draft || "",
    agent_notes: row.agent_notes || "",
    created_at: row.created_at || "",
    resolved_at: row.resolved_at || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [orders, invoices, payments, anomalies, settings] = await Promise.all([
      readAllRecords("orders"),
      readAllRecords("invoices"),
      readAllRecords("payments"),
      readAllRecords("anomalies"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ orders, invoices, payments, anomalies, settings });
    const config_summary = buildConfigSummary({ settings });
    return {
      app: "kelly-audit",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: orders.length > 0 || invoices.length > 0 || payments.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on an anomaly, written directly onto the anomaly record.
  // Ported from the retired local-file DataProvider's applyDecision():
  // "revise" only edits the draft, every other action moves the workflow
  // status per statusForVerdict()'s table (same as mergeAnomalies() used).
  async decideAnomaly({ anomaly_id, action, note = "", draft } = {}) {
    if (!anomaly_id || typeof anomaly_id !== "string") throw new Error("anomaly_id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("anomalies", "anomaly-id", anomaly_id);
    if (!existing) throw new Error(`Unknown anomaly: ${anomaly_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...baseAnomalyFields(current),
      anomaly_id,
      status: statusForVerdict(action, current.status || "needs_review"),
      draft: typeof draft === "string" ? draft : current.draft || "",
      decision_action: action,
      decision_note: String(note || ""),
      decided_at: now,
    };
    await upsert("anomalies", "anomaly-id", anomaly_id, fields, `Decision on anomaly ${anomaly_id}: ${action}`);
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
