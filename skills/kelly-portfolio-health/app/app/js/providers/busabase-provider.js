import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  applyContractDecision,
  baseContractFields,
  buildConfigSummary,
  buildSnapshot,
  normalizeContractRow,
} from "../portfolio-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. Human actions
// made from a standalone local preview (the trusted operator's own machine)
// merge immediately; actions made from the deployed AirApp create a pending
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

// Every contract a human can flag/annotate already exists (contracts enter
// Busabase through an external portfolio-sync process — the app itself never
// creates a contract record), so decideContract only ever updates an
// existing record. bases.createChangeRequest stays declared in permissions
// for parity with the rest of this migration batch, but this provider never
// calls it.
async function updateContractRecord(existing, contract, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(baseContractFields(contract)),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

async function loadContractRecord(contractId) {
  const existing = await findRecord("contracts", "contract-id", contractId);
  if (!existing) throw new Error(`Unknown contract id: ${contractId}`);
  const current = normalizeContractRow(normalizeFields(existing.headCommit?.fields || existing.fields));
  return { existing, current };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [contractRows, settingsRows] = await Promise.all([readAllRecords("contracts"), readAllRecords("settings")]);
    const configRow = findSettingsRow(settingsRows, "config");
    const config_summary = buildConfigSummary(parsePayload(configRow?.payload));
    const contracts = contractRows.map(normalizeContractRow);
    const snapshot = buildSnapshot({ contracts, configSummary: config_summary });
    return {
      app: "kelly-portfolio-health",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human "flag for review" / "clear flag" / note action, written directly
  // onto the contract's own Busabase record. Ported from the retired
  // LocalFileProvider's setDecision() method (the default local-file data
  // provider) — no separate decisions.json bucket in the Busabase-only shape.
  async decideContract(contractId, patch = {}) {
    if (!contractId) throw new Error("contractId is required");
    await ensureResources();
    const { existing, current } = await loadContractRecord(contractId);
    const now = new Date().toISOString();
    const next = applyContractDecision(current, patch, now);
    await updateContractRecord(existing, next, `Update review decision for ${contractId}`);
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
