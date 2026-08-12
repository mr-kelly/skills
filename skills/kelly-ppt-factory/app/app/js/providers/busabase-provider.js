import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  baseDeckFields,
  baseSlideFields,
  buildSnapshot,
  normalizeDeckRow,
  normalizeSlideRow,
  statusFromDecision,
} from "../ppt-model.js?v=0.1.0";
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
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [projects, decks, slideCards, styleSystems, qaChecks, exportsList, settings] = await Promise.all([
      readAllRecords("projects"),
      readAllRecords("decks"),
      readAllRecords("slideCards"),
      readAllRecords("styleSystems"),
      readAllRecords("qaChecks"),
      readAllRecords("exports"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ projects, decks, slideCards, styleSystems, qaChecks, exportsList, settings });
    return {
      app: appConfig.appId,
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: projects.length > 0 || decks.length > 0, config_version: "1" },
      lock: null,
      config_summary: {
        config_path: "busabase",
        is_example: false,
        default_brand_id: snapshot.brand_profiles[0]?.client_id || "",
        brand_profiles: snapshot.brand_profiles,
        style_systems: snapshot.style_systems,
        export: snapshot.style_systems.length
          ? {
              out_dir: settings.export_out_dir || "exports",
              render_dir: settings.export_render_dir || "exports/rendered",
              pptx_template: settings.export_pptx_template || "",
              require_render_qa: String(settings.export_require_render_qa || "true") === "true",
            }
          : {},
      },
      snapshot,
    };
  },

  // Human verdict on a slide card or deck, written directly onto its own
  // record. Ported in spirit from the retired local-file DataProvider's
  // applyDecision(): every action maps through statusFromDecision()'s table
  // and is recorded literally as decision_action — this drops the retired
  // local-file provider's separate decisions.json bucket and agent_tasks
  // queue, since Busabase reads are always live.
  async decideItem({ targetType, id, action, comment = "", draft } = {}) {
    if (targetType !== "deck" && targetType !== "slide") throw new Error("targetType must be 'deck' or 'slide'");
    if (!id || typeof id !== "string") throw new Error("id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const baseKey = targetType === "deck" ? "decks" : "slideCards";
    const idFieldSlug = targetType === "deck" ? "deck-id" : "slide-id";
    const existing = await findRecord(baseKey, idFieldSlug, id);
    if (!existing) throw new Error(`Unknown ${targetType}: ${id}`);
    const currentRaw = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const nextStatus = statusFromDecision(action);
    if (targetType === "deck") {
      const current = normalizeDeckRow(currentRaw);
      const nextFields = baseDeckFields({
        ...current,
        deck_id: id,
        status: nextStatus || current.status,
        review_draft_note: typeof draft === "string" ? draft : current.review_draft_note,
        decision_action: action,
        decision_note: String(comment || ""),
        decided_at: now,
        updated_at: now,
      });
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      await runtimeClient.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields: toBusabaseFields(nextFields),
        message: `Decision on deck ${id}: ${action}`,
        author: appConfig.appId,
        baseCommitId: existing.headCommitId,
        autoMerge: isStandaloneLocalRuntime(),
      });
    } else {
      const current = normalizeSlideRow(currentRaw);
      const nextFields = baseSlideFields({
        ...current,
        slide_id: id,
        status: nextStatus || current.status,
        review_draft_note: typeof draft === "string" ? draft : current.review_draft_note,
        decision_action: action,
        decision_note: String(comment || ""),
        decided_at: now,
        updated_at: now,
      });
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      await runtimeClient.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields: toBusabaseFields(nextFields),
        message: `Decision on slide card ${id}: ${action}`,
        author: appConfig.appId,
        baseCommitId: existing.headCommitId,
        autoMerge: isStandaloneLocalRuntime(),
      });
    }
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
