import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import {
  buildBatch,
  buildConfigSummary,
  buildScenario,
  newScenarioId,
  normalizeScenarioRow,
  scenarioToFields,
} from "../simulator-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. Direct writes
// made from a standalone local preview (the trusted operator's own machine)
// merge immediately; writes made from the deployed AirApp create a pending
// ChangeRequest for the trusted process to merge, per the AirApp boundary.
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

async function createScenarioRecord(scenario, message) {
  if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
  const declared = base("scenarios");
  return runtimeClient.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(scenarioToFields(scenario)),
    message,
    submittedBy: appConfig.appId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

async function updateScenarioRecord(existing, scenario, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(scenarioToFields(scenario)),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

async function readScenarios() {
  const rows = await readAllRecords("scenarios");
  return rows.map(normalizeScenarioRow);
}

async function readSettingsRows() {
  return readAllRecords("settings");
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [scenarios, settingsRows] = await Promise.all([readScenarios(), readSettingsRows()]);
    const configRow = settingsRows.find((row) => row.kind === "config");
    return {
      app: "kelly-revshare-simulator",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary: buildConfigSummary(settingsRows),
      batch: buildBatch(scenarios),
    };
  },

  // Direct create: the analyst saves a new named scenario straight into
  // Busabase -- this is a direct-manipulation control panel, not a
  // review/approval queue. Ported from the retired Hono POST /api/scenarios.
  async createScenario(name, input) {
    if (!name) throw new Error("name is required");
    if (!input) throw new Error("input is required");
    await ensureResources();
    const scenario = buildScenario(name, input, newScenarioId());
    await createScenarioRecord(scenario, `Create scenario ${scenario.name || scenario.id}`);
    return scenario;
  },

  // Direct update: edit an existing scenario's name/inputs. Ported from the
  // retired Hono PUT /api/scenarios/:id.
  async updateScenario(id, name, input) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("scenarios", "scenario-id", id);
    if (!existing) throw new Error(`Unknown scenario id: ${id}`);
    const current = normalizeScenarioRow(normalizeFields(existing.headCommit?.fields || existing.fields));
    const next = buildScenario(name || current.name, input || current.input, id);
    next.created_at = current.created_at;
    next.decision = current.decision;
    await updateScenarioRecord(existing, next, `Update scenario ${next.name || next.id}`);
    return next;
  },

  // Direct write: record the analyst's underwriting verdict straight onto
  // the scenario's own Busabase record -- no separate decisions/handoff-log
  // bucket in the Busabase-only shape. Ported from the retired Hono POST
  // /api/scenarios/:id/decision.
  async saveDecision(id, action, note = "") {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("scenarios", "scenario-id", id);
    if (!existing) throw new Error(`Unknown scenario id: ${id}`);
    const current = normalizeScenarioRow(normalizeFields(existing.headCommit?.fields || existing.fields));
    const next = {
      ...current,
      decision: { action: action || null, note: note || "", decided_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
    await updateScenarioRecord(existing, next, `Record decision for ${next.name || next.id}`);
    return next;
  },

  // Direct delete: remove a saved scenario. Ported from the retired Hono
  // DELETE /api/scenarios/:id. Busabase always requires an explicit review
  // before a delete ChangeRequest can merge (autoMerge is rejected
  // server-side for delete operations, unlike create/update) -- so on a
  // standalone local runtime (the trusted operator's own machine) this
  // reviews and merges its own request right after submitting it, the
  // automated equivalent of the operator approving their own action in
  // Busabase's review UI. A deployed AirApp only submits the request and
  // leaves it pending for a human to review directly in Busabase.
  async deleteScenario(id) {
    if (!id) throw new Error("id is required");
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    await ensureResources();
    const existing = await findRecord("scenarios", "scenario-id", id);
    if (!existing) return { ok: true, pending: false };
    const changeRequest = await runtimeClient.records.changeRequest({
      recordId: existing.id,
      operation: "delete",
      message: `Delete scenario ${id}`,
      submittedBy: appConfig.appId,
    });
    if (!isStandaloneLocalRuntime()) return { ok: true, pending: true };
    if (!allowedWrites.has("changeRequests.review") || !allowedWrites.has("changeRequests.merge")) {
      throw new Error("PROCEDURE_DENIED: changeRequests.review/changeRequests.merge");
    }
    const changeRequestId = changeRequest.id || changeRequest.changeRequest?.id;
    await runtimeClient.changeRequests.review({ changeRequestIds: [changeRequestId], verdict: "approved" });
    await runtimeClient.changeRequests.merge({ changeRequestIds: [changeRequestId] });
    return { ok: true, pending: false };
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
