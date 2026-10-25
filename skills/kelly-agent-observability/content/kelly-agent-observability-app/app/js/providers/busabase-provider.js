import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  baseHandoffFields,
  buildFleetSnapshot,
  normalizeAgentRow,
  normalizeHandoffRow,
  normalizeTraceRow,
  summarizeFleet,
} from "../fleet-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

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

// Record reads go through the SDK's helper, bound to this app's client.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
}

const initialPageCursors = {};
const initialTotalCounts = {};

async function readFirstPage(key) {
  const [{ rows, nextCursor }, total] = await Promise.all([readPage(key), countRecords(key)]);
  initialPageCursors[key] = nextCursor;
  initialTotalCounts[key] = total;
  return rows;
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({ baseId: declared.baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

function normalizePageRows(key, rows) {
  const normalizers = { agents: normalizeAgentRow, traces: normalizeTraceRow, handoffs: normalizeHandoffRow };
  const normalize = normalizers[key];
  return normalize ? rows.map(normalize) : rows;
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

// Agents and traces enter Busabase only through the trusted
// scripts/generate_fleet_data.mjs seed script (mirrors kelly-portfolio-health's
// "contracts enter through an external sync process" precedent); the browser
// provider only ever reads those two Bases, never writes them. The only Base
// this provider writes to is `handoffs`, and only ever by creating a new row.
function withPagination(data) {
  return {
    ...data,
    pagination: { ...initialPageCursors },
    totals: { ...initialTotalCounts },
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    for (const key of Object.keys(initialPageCursors)) delete initialPageCursors[key];
    for (const key of Object.keys(initialTotalCounts)) delete initialTotalCounts[key];
    await ensureResources();
    const [agentRows, traceRows, handoffRows, settingsRows] = await Promise.all([
      readFirstPage("agents"),
      readFirstPage("traces"),
      readFirstPage("handoffs"),
      readFirstPage("settings"),
    ]);
    const metaRow = findSettingsRow(settingsRows, "fleet_meta");
    const meta = parsePayload(metaRow?.payload);
    const agents = agentRows.map(normalizeAgentRow);
    const traces = traceRows.map(normalizeTraceRow);
    const fleet = buildFleetSnapshot({ agentRows: agents, traceRows: traces, generatedAt: meta.generated_at || "" });
    const handoffs = handoffRows.map(normalizeHandoffRow);
    return withPagination({
      app: "kelly-agent-observability",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(metaRow), config_version: "1" },
      lock: null,
      fleet,
      summary: summarizeFleet(fleet),
      handoffs,
    });
  },

  // Human "acknowledge" / "needs investigation" handoff note, appended as a
  // new row in the handoffs Base — never a field update on the agent/trace's
  // own record (those are trusted-script-owned). Ported from the retired
  // hono.ts's POST /api/handoffs handler.
  async submitHandoff({
    target_type = "agent",
    target_id = "",
    agent_id = "",
    status = "acknowledged",
    note = "",
    created_by = "operator",
  } = {}) {
    if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
    if (!["agent", "trace"].includes(target_type)) throw new Error("target_type must be agent or trace");
    if (!target_id) throw new Error("target_id is required");
    if (!["acknowledged", "needs_investigation"].includes(status)) {
      throw new Error("status must be acknowledged or needs_investigation");
    }
    await ensureResources();
    const declared = base("handoffs");
    const handoff = {
      handoff_id: crypto.randomUUID(),
      target_type,
      target_id,
      agent_id,
      status,
      note: String(note || "").slice(0, 2000),
      created_at: new Date().toISOString(),
      created_by,
    };
    await runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: toBusabaseFields(baseHandoffFields(handoff)),
      message: `Record ${status} handoff for ${target_type} ${target_id}`,
      submittedBy: appConfig.appId,
    });
    return handoff;
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    return { ...page, rows: normalizePageRows(key, page.rows) };
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
