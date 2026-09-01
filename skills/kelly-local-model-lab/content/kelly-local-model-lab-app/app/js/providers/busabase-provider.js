import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  applyEvaluationVerdict,
  applyExampleVerdict,
  baseEvaluationFields,
  baseExampleFields,
  buildSnapshot,
  parseJson,
} from "../lab-model.js?v=0.1.0";
import { isStandaloneLocalRuntime } from "../runtime.js";

export { isStandaloneLocalRuntime };

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key.replaceAll("_", "-"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
let loadedRows = new Map();
let pageState = new Map();

const snapshotKeys = {
  "training-examples": "examples",
  "training-runs": "runs",
  evaluations: "evaluations",
  "model-registry": "models",
  settings: "settings",
};

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
    throw new Error(
      `SETUP_REQUIRED: ${resources.missing.map((item) => item.name).join(", ") || appConfig.folder.name}`,
    );
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const value = runtimeBases.get(key);
  if (!value) throw new Error(`SETUP_REQUIRED: ${key}`);
  return value;
}

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: Math.min(declared.readLimit || 100, 100),
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

async function countRecords(key) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId });
    return total;
  } catch {
    return null;
  }
}

async function updateRecord(key, item, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  if (!item.__recordId || !item.__headCommitId) throw new Error(`STALE_ITEM: ${key}`);
  return runtimeClient.records.changeRequest({
    recordId: item.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: item.__headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

function settingsPayload(rows, kind) {
  return parseJson(rows.find((row) => row.kind === kind)?.payload, {});
}

function currentSnapshot() {
  const settingsRows = loadedRows.get("settings") || [];
  const snapshot = buildSnapshot({
    examples: loadedRows.get("training-examples") || [],
    runs: loadedRows.get("training-runs") || [],
    evaluations: loadedRows.get("evaluations") || [],
    models: loadedRows.get("model-registry") || [],
    settings: settingsPayload(settingsRows, "lab-config"),
  });
  const exampleTotal = pageState.get("training-examples")?.total;
  if (exampleTotal !== null && exampleTotal !== undefined) snapshot.counts.examples = exampleTotal;
  return snapshot;
}

function currentPaging() {
  return Object.fromEntries(
    [...pageState].map(([key, page]) => [
      key,
      {
        loaded: (loadedRows.get(key) || []).length,
        total: page.total,
        hasMore: Boolean(page.nextCursor),
      },
    ]),
  );
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    const resources = await ensureResources();
    const keys = Object.keys(snapshotKeys);
    const pages = await Promise.all(
      keys.map(async (key) => {
        const [page, total] = await Promise.all([readPage(key), countRecords(key)]);
        return { key, page, total };
      }),
    );
    loadedRows = new Map(pages.map(({ key, page }) => [key, page.rows]));
    pageState = new Map(pages.map(({ key, page, total }) => [key, { nextCursor: page.nextCursor, total }]));
    const settingsRows = loadedRows.get("settings") || [];
    return {
      app: appConfig.appId,
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(settingsRows.find((row) => row.kind === "lab-config")), config_version: "1" },
      resources: {
        folder_id: resources.folder?.id || "",
        base_ids: Object.fromEntries(resources.bases.map((item) => [item.key, item.baseId])),
      },
      snapshot: currentSnapshot(),
      paging: currentPaging(),
    };
  },

  async loadMore(key) {
    if (!Object.hasOwn(snapshotKeys, key)) throw new Error(`UNKNOWN_BASE: ${key}`);
    await ensureResources();
    const current = pageState.get(key);
    if (!current?.nextCursor) return { snapshot: currentSnapshot(), paging: currentPaging() };
    const page = await readPage(key, current.nextCursor);
    loadedRows.set(key, [...(loadedRows.get(key) || []), ...page.rows]);
    pageState.set(key, { ...current, nextCursor: page.nextCursor });
    return { snapshot: currentSnapshot(), paging: currentPaging() };
  },

  async reviewExample(example, verdict, note = "") {
    const next = applyExampleVerdict(example, verdict, note);
    await updateRecord(
      "training-examples",
      example,
      baseExampleFields(next),
      `${verdict} training example ${example.example_id}`,
    );
    return next;
  },

  async decideEvaluation(evaluation, verdict, note = "") {
    const next = applyEvaluationVerdict(evaluation, verdict, note);
    await updateRecord(
      "evaluations",
      evaluation,
      baseEvaluationFields(next),
      `${verdict} evaluation ${evaluation.evaluation_id}`,
    );
    return next;
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    try {
      return await provisionDeclaredResources(runtimeClient || createRuntimeClient(), appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) pendingSetupError = String(error.message);
      throw error;
    }
  },
};
