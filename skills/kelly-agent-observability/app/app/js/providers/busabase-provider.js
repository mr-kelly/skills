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
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. A handoff
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

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

// Agents and traces enter Busabase only through the trusted
// scripts/generate_fleet_data.mjs seed script (mirrors kelly-portfolio-health's
// "contracts enter through an external sync process" precedent); the browser
// provider only ever reads those two Bases, never writes them. The only Base
// this provider writes to is `handoffs`, and only ever by creating a new row.
export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [agentRows, traceRows, handoffRows, settingsRows] = await Promise.all([
      readAllRecords("agents"),
      readAllRecords("traces"),
      readAllRecords("handoffs"),
      readAllRecords("settings"),
    ]);
    const metaRow = findSettingsRow(settingsRows, "fleet_meta");
    const meta = parsePayload(metaRow?.payload);
    const agents = agentRows.map(normalizeAgentRow);
    const traces = traceRows.map(normalizeTraceRow);
    const fleet = buildFleetSnapshot({ agentRows: agents, traceRows: traces, generatedAt: meta.generated_at || "" });
    const handoffs = handoffRows.map(normalizeHandoffRow);
    return {
      app: "kelly-agent-observability",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(metaRow), config_version: "1" },
      lock: null,
      fleet,
      summary: summarizeFleet(fleet),
      handoffs,
    };
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
      autoMerge: isStandaloneLocalRuntime(),
    });
    return handoff;
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
