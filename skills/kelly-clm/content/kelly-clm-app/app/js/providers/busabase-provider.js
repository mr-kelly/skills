import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import {
  approvalToFields,
  buildContract,
  buildState,
  contractToFields,
  normalizeApprovalRow,
  normalizeContractRow,
  normalizeObligationRow,
  obligationToFields,
} from "../clm-model.js?v=0.1.0";
import { appConfig } from "../config.js?v=0.1.0";

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

async function readContracts() {
  const rows = await readAllRecords("contracts");
  return rows.map(normalizeContractRow);
}

async function readObligations() {
  const rows = await readAllRecords("obligations");
  return rows.map(normalizeObligationRow);
}

async function readApprovals() {
  const rows = await readAllRecords("approvals");
  return rows.map(normalizeApprovalRow);
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [contracts, obligations, approvals] = await Promise.all([
      readContracts(),
      readObligations(),
      readApprovals(),
    ]);
    return {
      ...buildState(contracts, obligations, approvals, {
        app: "kelly-clm",
        demo: false,
        profile: { company: "", boundary: "Local handoff only" },
      }),
      data_provider: "busabase",
      onboarding: { completed: contracts.length > 0 || obligations.length > 0, config_version: "1" },
    };
  },

  // Direct create: the operator saves a new contract straight into Busabase --
  // this is a direct-manipulation control panel, not a review/approval
  // queue. Ported from the retired local app's implicit "populate the local
  // app snapshot" workflow (there was never a create UI in the retired
  // local app -- this is the CRUD counterpart the Busabase-only shape adds).
  async createContract(input) {
    await ensureResources();
    const contract = buildContract(input);
    await createRecord("contracts", contractToFields(contract), `Create contract ${contract.name || contract.id}`);
    return contract;
  },

  // Direct update: edit an existing contract's fields.
  async updateContract(id, input) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("contracts", "contract-id", id);
    if (!existing) throw new Error(`Unknown contract id: ${id}`);
    const current = normalizeContractRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = buildContract({ ...current, ...input, id, created_at: current.created_at });
    await updateRecord(existing, contractToFields(next), `Update contract ${next.name || next.id}`);
    return next;
  },

  // Direct write: mark (or reopen) an obligation straight onto its own
  // Busabase record -- no separate handoff-log bucket. Ported from the
  // retired app's obligation status field, which the retired local app only
  // ever set through demo/seed data (there was no obligation-status write
  // path in the retired Hono API).
  async markObligationDone(id, done = true) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("obligations", "obligation-id", id);
    if (!existing) throw new Error(`Unknown obligation id: ${id}`);
    const current = normalizeObligationRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = { ...current, status: done ? "done" : "open", updated_at: new Date().toISOString() };
    await updateRecord(
      existing,
      obligationToFields(next),
      `${done ? "Complete" : "Reopen"} obligation ${next.title || next.id}`,
    );
    return next;
  },

  // Direct write: acknowledge a contract's renewal/notice deadline straight
  // onto the contract's own record (notice_acknowledged_at). New field --
  // the retired local app had no renewal-acknowledgement write path at all.
  async acknowledgeRenewal(contractId) {
    if (!contractId) throw new Error("contractId is required");
    await ensureResources();
    const existing = await findRecord("contracts", "contract-id", contractId);
    if (!existing) throw new Error(`Unknown contract id: ${contractId}`);
    const current = normalizeContractRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = { ...current, notice_acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await updateRecord(existing, contractToFields(next), `Acknowledge renewal notice for ${next.name || next.id}`);
    return next;
  },

  // Direct write: record the operator's approval decision straight onto the
  // approval's own Busabase record -- replaces the retired local app's
  // separate app/.data/decisions.json handoff bucket (readDecisions/
  // saveDecision in the retired app/server/store.ts) with a direct field
  // write, matching kelly-revshare-simulator's saveDecision() precedent.
  async saveApprovalDecision(id, action, note = "") {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("approvals", "approval-id", id);
    if (!existing) throw new Error(`Unknown approval id: ${id}`);
    const current = normalizeApprovalRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const status = { approve: "approved", changes: "changes_requested", block: "blocked" }[action] || action;
    const next = {
      ...current,
      status,
      decision_note: note || "",
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await updateRecord(existing, approvalToFields(next), `Record decision for ${next.title || next.id}`);
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
