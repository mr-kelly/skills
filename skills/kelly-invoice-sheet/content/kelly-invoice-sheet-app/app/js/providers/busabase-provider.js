import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  applyDecisionToInvoice,
  assembleBatch,
  baseInvoiceFields,
  buildConfigSummary,
  computeInvoiceFromRow,
} from "../invoice-model.js?v=0.1.0";

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
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

const countInvoices = (status) =>
  countRecords("invoices", [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }]);

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function updateRecord(key, existing, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [invoicePage, settingsPage, total, needsReview, changesRequested, approved, done, blocked] =
      await Promise.all([
        readPage("invoices"),
        readPage("settings"),
        countRecords("invoices"),
        countInvoices("needs_review"),
        countInvoices("changes_requested"),
        countInvoices("approved"),
        countInvoices("done"),
        countInvoices("blocked"),
      ]);
    const configRow = findSettingsRow(settingsPage.rows, "config");
    const configPayload = parsePayload(configRow?.payload);
    const config_summary = buildConfigSummary(configPayload);
    const invoices = invoicePage.rows.map(computeInvoiceFromRow);
    const batch = assembleBatch({
      invoices,
      lowConfidenceThreshold: config_summary.extraction.low_confidence_threshold,
    });
    if (total !== null) batch.metrics.total = total;
    if (needsReview !== null) batch.metrics.needs_review = needsReview;
    if (changesRequested !== null) batch.metrics.changes_requested = changesRequested;
    if (approved !== null) batch.metrics.approved = approved;
    if (done !== null) batch.metrics.done = done;
    if (blocked !== null) batch.metrics.blocked = blocked;
    return {
      app: "kelly-invoice-sheet",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      batch,
      pagination: { invoices: invoicePage.nextCursor },
      totalCount: { invoices: total },
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  // Human verdict (approve / request_changes / block / revise), written
  // directly onto the invoice record. Ported from the retired local-file
  // DataProvider's applyDecision()+applyDecisionToInvoice() — there is no
  // separate decisions.json bucket in the Busabase-only shape.
  async submitDecision({ item_id, action, comment = "", patch = null } = {}) {
    if (!item_id || typeof item_id !== "string") throw new Error("submitDecision requires an item_id");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`Unsupported action: ${action}. Must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("invoices", "invoice-id", item_id);
    if (!existing) throw new Error(`Unknown invoice id: ${item_id}`);
    const current = computeInvoiceFromRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const now = new Date().toISOString();
    const next = applyDecisionToInvoice(current, { item_id, action, comment, patch: patch || {}, decided_at: now });

    await updateRecord(
      "invoices",
      existing,
      baseInvoiceFields({
        ...next,
        id: item_id,
        decision_action: action,
        decision_note: String(comment || ""),
        decided_at: now,
      }),
      `Decision on invoice ${item_id}: ${action}`,
    );

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
