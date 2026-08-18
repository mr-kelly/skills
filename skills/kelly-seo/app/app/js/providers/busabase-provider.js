import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  evaluateGeoGate,
  normalizeSettingsRow,
  statusForVerdict,
} from "../seo-model.js?v=0.1.0";

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

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [sites, queries, pages, opportunities, geoOpportunities, entitySignals, aiVisibilityPrompts, settings] =
      await Promise.all([
        readAllRecords("sites"),
        readAllRecords("queries"),
        readAllRecords("pages"),
        readAllRecords("opportunities"),
        readAllRecords("geo_opportunities"),
        readAllRecords("entity_signals"),
        readAllRecords("ai_visibility"),
        readSettingsRow(),
      ]);
    const snapshot = buildSnapshot({
      sites,
      queries,
      pages,
      opportunities,
      geoOpportunities,
      entitySignals,
      aiVisibilityPrompts,
      settings,
    });
    return {
      app: "kelly-seo",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: sites.length > 0, config_version: "1" },
      lock: null,
      config_summary: buildConfigSummary({ settings: normalizeSettingsRow(settings) }),
      snapshot,
    };
  },

  // Human verdict on an SEO opportunity, written directly onto the
  // opportunity record. No separate decisions.json-equivalent bucket:
  // Busabase reads are always live, so the record itself is the single
  // source of truth for both the draft and its review state.
  async decideOpportunity({ opportunity_id, action, note = "", draft } = {}) {
    if (!opportunity_id || typeof opportunity_id !== "string") throw new Error("opportunity_id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("opportunities", "opportunity-id", opportunity_id);
    if (!existing) throw new Error(`Unknown opportunity: ${opportunity_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const nextFields = {
      ...current,
      opportunity_id,
      status: statusForVerdict(action, current.status || "needs_review"),
      decision_action: action,
      decision_note: String(note || ""),
      decision_draft: typeof draft === "string" ? draft : current.decision_draft || "",
      decided_at: now,
    };
    await upsert(
      "opportunities",
      "opportunity-id",
      opportunity_id,
      nextFields,
      `Decision on opportunity ${opportunity_id}: ${action}`,
    );
    return { ok: true };
  },

  // Human verdict on a GEO content-optimization opportunity. geo-qa is a
  // hard gate: a BLOCKed change cannot be approved (matches the retired
  // local-file provider's HTTP 422 behavior, now a thrown Error).
  async decideGeoOpportunity({ geo_opportunity_id, action, note = "", draft } = {}) {
    if (!geo_opportunity_id || typeof geo_opportunity_id !== "string") {
      throw new Error("geo_opportunity_id is required");
    }
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("geo_opportunities", "geo-opportunity-id", geo_opportunity_id);
    if (!existing) throw new Error(`Unknown GEO opportunity: ${geo_opportunity_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const effectiveDraft = typeof draft === "string" ? draft : current.decision_draft || current.draft || "";
    if (action === "approve") {
      const gate = evaluateGeoGate({
        draft: effectiveDraft,
        claims: current.claims ? JSON.parse(current.claims) : [],
        has_schema: current.has_schema === "true",
        has_qa_block: current.has_qa_block === "true",
      });
      if (gate.verdict === "BLOCK") {
        throw new Error("geo-qa BLOCK: resolve the failing checks before approving this GEO change.");
      }
    }
    const now = new Date().toISOString();
    const nextFields = {
      ...current,
      geo_opportunity_id,
      status: statusForVerdict(action, current.status || "needs_review"),
      decision_action: action,
      decision_note: String(note || ""),
      decision_draft: typeof draft === "string" ? draft : current.decision_draft || "",
      decided_at: now,
    };
    await upsert(
      "geo_opportunities",
      "geo-opportunity-id",
      geo_opportunity_id,
      nextFields,
      `Decision on GEO opportunity ${geo_opportunity_id}: ${action}`,
    );
    return { ok: true };
  },

  // Update one entity-readiness signal's status, written directly onto the
  // signal record — the record is the only source of truth, no separate
  // overrides bucket.
  async updateEntitySignal({ signal_id, status, note = "" } = {}) {
    if (!signal_id || typeof signal_id !== "string") throw new Error("signal_id is required");
    if (!["present", "partial", "missing"].includes(status)) {
      throw new Error("status must be one of: present, partial, missing");
    }
    await ensureResources();
    const existing = await findRecord("entity_signals", "signal-id", signal_id);
    if (!existing) throw new Error(`Unknown entity signal: ${signal_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const nextFields = {
      ...current,
      signal_id,
      status,
      detail: note ? String(note) : current.detail || "",
    };
    await upsert("entity_signals", "signal-id", signal_id, nextFields, `Update entity signal ${signal_id}: ${status}`);
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
