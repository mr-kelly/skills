import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  ROLLOUT_ACTIONS,
  applyAnomalyAck,
  applyRolloutDecision,
  baseRouteFields,
  buildConfigSummary,
  buildSnapshot,
  normalizeModelRow,
  normalizeRouteRow,
  normalizeServiceRow,
  parseAnomalyId,
} from "../gateway-model.js?v=0.1.0";

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

// Every route a human can act on already exists (routes enter Busabase
// through an external gateway usage-ingestion process — the app itself never
// creates a route record), so decideRollout/ackAnomaly only ever update an
// existing record. bases.createChangeRequest stays declared in permissions
// for parity with the rest of this migration batch, but this provider never
// calls it.
async function updateRouteRecord(existing, route, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(baseRouteFields(route)),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge: isStandaloneLocalRuntime(),
  });
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

async function loadRouteRecord(routeId) {
  const existing = await findRecord("routes", "route-id", routeId);
  if (!existing) throw new Error(`Unknown route id: ${routeId}`);
  const current = normalizeRouteRow(
    normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
  );
  return { existing, current };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [routeRows, serviceRows, modelRows, settingsRows] = await Promise.all([
      readAllRecords("routes"),
      readAllRecords("services"),
      readAllRecords("models"),
      readAllRecords("settings"),
    ]);
    const configRow = findSettingsRow(settingsRows, "config");
    const config_summary = buildConfigSummary(parsePayload(configRow?.payload));
    const routes = routeRows.map(normalizeRouteRow);
    const services = serviceRows.map(normalizeServiceRow);
    const models = modelRows.map(normalizeModelRow);
    const snapshot = buildSnapshot({ services, models, routes, configSummary: config_summary });
    return {
      app: "kelly-llm-gateway",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Direct rollout write: promote/rollback/hold, written straight onto the
  // route's own Busabase record. Ported from recordRolloutDecision() +
  // attachDerived()'s rollout overlay (retired app/server/decisions.ts and
  // app/server/store.ts) — no separate decisions/handoff-log bucket in the
  // Busabase-only shape.
  async decideRollout(routeId, action, note = "") {
    if (!routeId) throw new Error("routeId is required");
    if (!ROLLOUT_ACTIONS.includes(action)) throw new Error(`action must be one of ${ROLLOUT_ACTIONS.join("|")}`);
    await ensureResources();
    const { existing, current } = await loadRouteRecord(routeId);
    const next = applyRolloutDecision(current, action, note);
    await updateRouteRecord(existing, next, `${action} rollout for ${routeId}`);
    return next;
  },

  // Direct anomaly write: acknowledge a cost/error spike, written straight
  // onto the route's own cost_spike_ack/error_spike_ack field. Ported from
  // recordAnomalyAck() (retired app/server/decisions.ts).
  async ackAnomaly(anomalyId, note = "") {
    const { kind, route_id } = parseAnomalyId(anomalyId);
    if (!kind || !route_id) throw new Error(`Unknown anomaly id: ${anomalyId}`);
    await ensureResources();
    const { existing, current } = await loadRouteRecord(route_id);
    const next = applyAnomalyAck(current, kind, note);
    await updateRouteRecord(existing, next, `Acknowledge ${kind} anomaly for ${route_id}`);
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
