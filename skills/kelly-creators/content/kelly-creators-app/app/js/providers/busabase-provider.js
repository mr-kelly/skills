import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { DECISION_ACTIONS, buildSnapshot, statusForAction } from "../creators-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTION_SET = new Set(DECISION_ACTIONS);

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

async function readSettingsRows() {
  const rows = await readAllRecords("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function configSummaryFromProfile(profile = {}) {
  const operator = profile.operator || {};
  const program = profile.program || {};
  const brands = Array.isArray(profile.brands) ? profile.brands : [];
  const platforms = Array.isArray(profile.platforms) ? profile.platforms : [];
  const style = profile.style || {};
  return {
    config_path: "busabase:base/kelly-creators-settings",
    is_example: false,
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    program: {
      base_currency: program.base_currency || "USD",
      budget_total: Number(program.budget_total || 0),
      target_niches: Array.isArray(program.target_niches) ? program.target_niches : [],
    },
    brands: brands.map((brand) => ({
      brand_id: brand.brand_id || "",
      display_name: brand.display_name || brand.brand_id || "",
      positioning: brand.positioning || "",
    })),
    style_tone: style.tone || "",
    platforms: platforms.map((platform) => ({
      platform_id: platform.platform_id || "",
      type: platform.type || "",
      display_name: platform.display_name || platform.platform_id || "",
      handoff_skill: platform.handoff_skill || "",
      secret_envs: Array.isArray(platform.secret_envs) ? platform.secret_envs : [],
      secrets_ready: Boolean(platform.secrets_ready),
    })),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [creators, settings] = await Promise.all([readAllRecords("creators"), readSettingsRows()]);
    const snapshot = buildSnapshot({ creators });
    const profileRow = settings.get("kelly-creators-profile") || {};
    const lockRow = settings.get("kelly-creators-lock") || {};
    const profile = parsePayload(profileRow.payload);
    const config_summary = configSummaryFromProfile(profile);
    snapshot.base_currency = config_summary.program.base_currency;
    snapshot.metrics.budget_total = config_summary.program.budget_total;
    return {
      app: "kelly-creators",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(profileRow.record_id), config_version: "1" },
      config_summary,
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      decisions: {},
      snapshot,
    };
  },

  async applyDecision(creatorId, payload = {}) {
    const action = String(payload.action || "");
    if (!DECISION_ACTION_SET.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const now = new Date().toISOString();
    const existing = await findRecord("creators", "creator-id", creatorId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const fields = {
      ...current,
      creator_id: creatorId,
      status: statusForAction(action),
      decision_note: String(payload.comment || ""),
      decided_at: now,
      ...(payload.draft !== undefined ? { suggested_reply: String(payload.draft) } : {}),
    };
    await upsert("creators", "creator-id", creatorId, fields, `Decision on creator ${creatorId}: ${action}`);
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
