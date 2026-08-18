import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  QA_CHECKS,
  buildDecision,
  buildSnapshot,
  decisionToFields,
  decisionsToMap,
  normalizeDecisionRow,
} from "../digital-human-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. A decision
// submitted from a standalone local preview (the trusted operator's own
// machine) merges immediately; one submitted from the deployed AirApp creates
// a pending ChangeRequest for the trusted process to merge, per the AirApp
// boundary.
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

async function createRecord(key, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
  const declared = base(key);
  return runtimeClient.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: appConfig.appId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

async function updateRecord(existing, fields, message) {
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

async function readDecisions() {
  const rows = await readAllRecords("qa-decisions");
  return rows.map(normalizeDecisionRow);
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const decisions = await readDecisions();
    const generated_at = new Date().toISOString();
    return {
      app: "kelly-digital-human",
      demo: false,
      generated_at,
      snapshot: buildSnapshot(QA_CHECKS, { generated_at }),
      decisions: decisionsToMap(decisions),
      data_provider: "busabase",
      onboarding: { completed: true, config_version: "1" },
    };
  },

  // Direct write: record the operator's decision straight onto the check's
  // own Busabase record -- replaces the retired local app's separate
  // app/.data/decisions.json handoff bucket (readJson/writeJson against
  // decisionsPath in the retired app/server/index.ts) with a direct field
  // write, matching kelly-clm's saveApprovalDecision() precedent. Creates the
  // row the first time a check is decided; updates it on every later
  // decision for the same check. Looks up the existing row through
  // readAllRecords() (records.list) rather than records.get(fieldSlug=...):
  // the QA checklist is fixed at 8 possible check ids, so listing the whole
  // (<=100 row) Base is cheap, and it avoids a guaranteed-404 network call
  // the very first time any given check is decided (records.get 404s when no
  // record matches yet, which is the common case here).
  async saveDecision(checkId, action, note = "") {
    if (!checkId) throw new Error("checkId is required");
    await ensureResources();
    const rows = await readAllRecords("qa-decisions");
    const existingRow = rows.find((row) => row.check_id === checkId);
    const next = buildDecision({ check_id: checkId, action, note });
    if (existingRow) {
      const existing = { id: existingRow.__recordId, headCommitId: existingRow.__headCommitId };
      await updateRecord(existing, decisionToFields(next), `Record decision for ${checkId}`);
    } else {
      await createRecord("qa-decisions", decisionToFields(next), `Record decision for ${checkId}`);
    }
    return next;
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
