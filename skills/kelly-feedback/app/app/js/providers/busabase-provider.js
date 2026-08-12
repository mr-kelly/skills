import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  FEEDBACK_ACTIONS,
  PROPOSAL_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  statusForProposalAction,
  triageForFeedbackAction,
} from "../feedback-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

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

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function proposalFields(row) {
  return {
    proposal_id: row.proposal_id,
    type: row.type || "promote_request",
    title: row.title || "",
    status: row.status || "needs_review",
    request_id: row.request_id || "",
    request_ids: row.request_ids || "[]",
    target_lane: row.target_lane || "",
    reason: row.reason || "",
    evidence: row.evidence || "",
    draft_kind: row.draft_kind || "",
    draft: row.draft || "",
    review_note: row.review_note || "",
    created_at: row.created_at || "",
    decided_at: row.decided_at || "",
  };
}

function feedbackFields(row) {
  return {
    feedback_id: row.feedback_id,
    source_id: row.source_id || "",
    channel: row.channel || "",
    product: row.product || "",
    user_handle: row.user_handle || "",
    user_plan: row.user_plan || "",
    user_tenure_months: row.user_tenure_months ?? 0,
    user_weight: row.user_weight ?? 1,
    text: row.text || "",
    sentiment: row.sentiment || "neutral",
    received_at: row.received_at || "",
    permalink: row.permalink || "",
    request_id: row.request_id || "",
    triage: row.triage || "new",
    agent_note: row.agent_note || "",
  };
}

function requestFields(row) {
  return {
    request_id: row.request_id,
    title: row.title || "",
    product: row.product || "",
    status: row.status || "candidate",
    trend: row.trend || "flat",
    effort_estimate: row.effort_estimate || "",
    problem_statement: row.problem_statement || "",
    spec_summary: row.spec_summary || "",
    representative_feedback_ids: row.representative_feedback_ids || "[]",
    decision_history: row.decision_history || "[]",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [products, sources, feedback, requests, roadmap, proposals, sync_log, settings] = await Promise.all([
      readAllRecords("products"),
      readAllRecords("sources"),
      readAllRecords("feedback"),
      readAllRecords("requests"),
      readAllRecords("roadmap"),
      readAllRecords("proposals"),
      readAllRecords("sync_log"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ products, sources, feedback, requests, roadmap, proposals, sync_log });
    const config_summary = buildConfigSummary({ settings, products, sources });
    return {
      app: "kelly-feedback",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: sources.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on a roadmap decision (approve/request_changes/block/revise),
  // written directly onto the proposal record. Ported from the retired
  // local-file provider's saveDecision(kind: "proposal"): "revise" is a draft
  // edit that never changes status (matches statusForProposalAction).
  async decideProposal({ proposal_id, action, review_note = "", draft } = {}) {
    if (!PROPOSAL_ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`);
    await ensureResources();
    const existing = await findRecord("proposals", "proposal-id", proposal_id);
    if (!existing) throw new Error(`Unknown proposal: ${proposal_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...proposalFields(current),
      proposal_id,
      status: statusForProposalAction(action, current.status || "needs_review"),
      review_note: String(review_note || current.review_note || ""),
      ...(typeof draft === "string" ? { draft } : {}),
      decided_at: action === "revise" ? current.decided_at || "" : now,
    };
    await upsert("proposals", "proposal-id", proposal_id, fields, `Decision on proposal ${proposal_id}: ${action}`);
    return { ok: true };
  },

  // Feedback triage (assign/ignore/insight), written directly onto the
  // feedback record. Ported from the retired local-file provider's
  // saveDecision(kind: "feedback").
  async decideFeedback({ feedback_id, action, request_id = "", comment = "" } = {}) {
    if (!FEEDBACK_ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`);
    await ensureResources();
    const existing = await findRecord("feedback", "feedback-id", feedback_id);
    if (!existing) throw new Error(`Unknown feedback item: ${feedback_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const fields = {
      ...feedbackFields(current),
      feedback_id,
      triage: triageForFeedbackAction(action, current.triage || "new"),
      request_id: action === "assign" ? String(request_id || current.request_id || "") : current.request_id || "",
      ...(comment ? { agent_note: String(comment) } : {}),
    };
    await upsert("feedback", "feedback-id", feedback_id, fields, `Triage feedback ${feedback_id}: ${action}`);
    return { ok: true };
  },

  // Edit a request's effort estimate, written directly onto the request
  // record. Ported from the retired local-file provider's
  // saveDecision(kind: "request").
  async saveRequestEffort({ request_id, effort_estimate = "" } = {}) {
    await ensureResources();
    const existing = await findRecord("requests", "request-id", request_id);
    if (!existing) throw new Error(`Unknown request: ${request_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const fields = {
      ...requestFields(current),
      request_id,
      effort_estimate: String(effort_estimate || ""),
      updated_at: new Date().toISOString(),
    };
    await upsert("requests", "request-id", request_id, fields, `Update effort estimate for request ${request_id}`);
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
