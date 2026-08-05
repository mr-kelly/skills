import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import {
  VALID_ACTIONS,
  buildBatch,
  buildConfigSummary,
  computeCandidate,
  rubricFromSettings,
  runMetaFromSettings,
  statusForAction,
} from "../scorer-model.js?v=0.1.0";

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
function baseCandidateFields(row) {
  return {
    candidate_id: row.candidate_id,
    business_name: row.business_name,
    category: row.category,
    city: row.city,
    requested_principal: row.requested_principal,
    monthly_revenue: row.monthly_revenue,
    red_flags: row.red_flags,
    status: row.status,
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [candidateRows, settingsRows] = await Promise.all([readAllRecords("candidates"), readAllRecords("settings")]);
    const config_summary = buildConfigSummary(settingsRows);
    const rubric = rubricFromSettings(settingsRows);
    const run = runMetaFromSettings(settingsRows);
    const items = candidateRows.map((row) => computeCandidate(row, rubric));
    const batch = buildBatch({
      items,
      batchId: run.batch_id || "",
      generatedAt: run.generated_at || "",
      source: "kelly-deal-scorer",
      rubric,
    });
    return {
      app: "kelly-deal-scorer",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: candidateRows.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      batch: candidateRows.length ? batch : null,
    };
  },

  // Human verdict (approve_term_sheet / send_back_for_data / reject), written
  // directly onto the candidate record. Ported from the retired local-file
  // DataProvider's submitReview(): the candidate's `status`, decision
  // `action`/`comment`/`decided_at` all live on the same row — there is no
  // separate decisions.json bucket.
  async submitReview({ id, action, comment = "" } = {}) {
    if (!id || typeof id !== "string") throw new Error("submitReview requires an id");
    if (!action || !VALID_ACTIONS.has(action)) {
      throw new Error(`Unknown decision action: ${action}. Must be one of: ${[...VALID_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("candidates", "candidate-id", id);
    if (!existing) throw new Error(`Candidate not found: ${id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...baseCandidateFields(current),
      candidate_id: id,
      status: statusForAction(action),
      decision_action: action,
      decision_comment: String(comment || ""),
      decided_at: now,
    };
    await upsert("candidates", "candidate-id", id, fields, `Decision on candidate ${id}: ${action}`);
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
