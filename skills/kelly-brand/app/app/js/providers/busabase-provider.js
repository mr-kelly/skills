import {
  DECISION_ACTIONS,
  DRIFT_ACTIONS,
  buildSnapshot,
  driftStatusForAction,
  statusForAction,
} from "../brand-model.js?v=0.1.0";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTION_SET = new Set(DECISION_ACTIONS);
const DRIFT_ACTION_SET = new Set(DRIFT_ACTIONS);

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

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

async function readSettingsRows() {
  const rows = await readAllRecords("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function configSummaryFromProfile(profile = {}) {
  const brand = profile.brand || {};
  const style = profile.style || {};
  const officialUrls = profile.official_urls || {};
  const riskPolicy = profile.risk_policy || {};
  const channels = Array.isArray(profile.channels) ? profile.channels : [];
  return {
    config_path: "busabase:base/kelly-brand-settings-v1",
    is_example: false,
    brand: {
      name: brand.name || "",
      category: brand.category || "",
      audience: brand.audience || "",
      mission: brand.mission || "",
      framework: brand.framework || "TALE",
    },
    style_tone: style.tone || "",
    reading_level: style.reading_level || "",
    official_urls: Object.entries(officialUrls).map(([key, value]) => ({ key, url: String(value) })),
    banned_phrases: Array.isArray(riskPolicy.banned_phrases) ? riskPolicy.banned_phrases : [],
    regulated_claims: Array.isArray(riskPolicy.regulated_claims) ? riskPolicy.regulated_claims : [],
    channels: channels.map((channel) => ({
      channel_id: channel.channel_id || "",
      type: channel.type || "",
      display_name: channel.display_name || channel.channel_id || "",
      monitored: Boolean(channel.monitored),
      secrets_ready: Boolean(channel.secrets_ready),
    })),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [items, driftAlerts, settings] = await Promise.all([
      readAllRecords("items"),
      readAllRecords("drift_alerts"),
      readSettingsRows(),
    ]);
    const snapshot = buildSnapshot({ items, driftAlerts });
    const profileRow = settings.get("kelly-brand-profile") || {};
    const lockRow = settings.get("kelly-brand-lock") || {};
    const profile = parsePayload(profileRow.payload);
    const config_summary = configSummaryFromProfile(profile);
    snapshot.brand_name = profile.brand?.name || "";
    return {
      app: "kelly-brand",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(profileRow.record_id), config_version: "1" },
      config_summary,
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      decisions: {},
      snapshot,
    };
  },

  async applyDecision(itemId, payload = {}) {
    const action = String(payload.action || "");
    await ensureResources();
    const now = new Date().toISOString();
    if (DECISION_ACTION_SET.has(action)) {
      const existing = await findRecord("items", "item-id", itemId);
      if (!existing) throw new Error("not_found");
      const current = normalizeFields(existing.headCommit?.fields || existing.fields);
      const fields = {
        ...current,
        item_id: itemId,
        status: statusForAction(action),
        decision_note: String(payload.comment || ""),
        decided_at: now,
        ...(payload.draft !== undefined ? { draft: String(payload.draft) } : {}),
      };
      await upsert("items", "item-id", itemId, fields, `Decision on item ${itemId}: ${action}`);
      return { ok: true };
    }
    if (DRIFT_ACTION_SET.has(action)) {
      const existing = await findRecord("drift_alerts", "alert-id", itemId);
      if (!existing) throw new Error("not_found");
      const current = normalizeFields(existing.headCommit?.fields || existing.fields);
      const fields = {
        ...current,
        alert_id: itemId,
        status: driftStatusForAction(action),
        decision_note: String(payload.comment || ""),
        decided_at: now,
      };
      await upsert("drift_alerts", "alert-id", itemId, fields, `Decision on drift alert ${itemId}: ${action}`);
      return { ok: true };
    }
    throw new Error(`Unsupported action: ${action}`);
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
