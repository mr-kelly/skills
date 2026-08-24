import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  RELEASE_DECISIONS,
  buildConfigSummary,
  buildReleaseDecision,
  buildRun,
  computeCase,
} from "../eval-model.js?v=0.1.0";

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

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields).
function baseCaseFields(row) {
  return {
    case_id: row.case_id,
    title: row.title,
    category: row.category,
    prompt: row.prompt || "",
    baseline_transcript: row.baseline_transcript || "",
    baseline_helpfulness: row.baseline_helpfulness,
    baseline_correctness: row.baseline_correctness,
    baseline_safety: row.baseline_safety,
    baseline_tone: row.baseline_tone,
    candidate_transcript: row.candidate_transcript || "",
    candidate_helpfulness: row.candidate_helpfulness,
    candidate_correctness: row.candidate_correctness,
    candidate_safety: row.candidate_safety,
    candidate_tone: row.candidate_tone,
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [caseRows, settingsRows] = await Promise.all([readAllRecords("cases"), readAllRecords("settings")]);
    const cases = caseRows.map(computeCase);
    const run = buildRun({ cases, settingsRows });
    const config_summary = buildConfigSummary(settingsRows);
    const release_decision = buildReleaseDecision(settingsRows);
    return {
      app: "kelly-agent-eval",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: caseRows.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      run: caseRows.length ? run : null,
      release_decision,
    };
  },

  // Human verdict on a regression, written directly onto the case record.
  // Ported from the retired local-file DataProvider's submitReview(): the
  // regression's `status`, decision `action`/`note`/`decided_at` all live on
  // the same row — there is no separate decisions.json bucket.
  async decideCase({ case_id, action, note = "" } = {}) {
    if (!case_id || typeof case_id !== "string") throw new Error("case_id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("cases", "case-id", case_id);
    if (!existing) throw new Error(`Unknown eval case: ${case_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...baseCaseFields(current),
      case_id,
      decision_action: action,
      decision_note: String(note || ""),
      decided_at: now,
    };
    await upsert("cases", "case-id", case_id, fields, `Decision on eval case ${case_id}: ${action}`);
    return { ok: true };
  },

  // Overall release verdict, written onto the single settings row of kind
  // "release". Ported from the retired submitReleaseDecision().
  async decideRelease({ decision, note = "" } = {}) {
    if (!decision || !RELEASE_DECISIONS.has(decision)) {
      throw new Error(`decision must be one of: ${[...RELEASE_DECISIONS].join(", ")}`);
    }
    await ensureResources();
    const now = new Date().toISOString();
    const payload = JSON.stringify({
      decision,
      note: String(note || ""),
      decided_at: now,
      decided_by: appConfig.appId,
    });
    await upsert(
      "settings",
      "record-id",
      "release",
      { record_id: "release", kind: "release", payload, updated_at: now },
      `Record release decision: ${decision}`,
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
