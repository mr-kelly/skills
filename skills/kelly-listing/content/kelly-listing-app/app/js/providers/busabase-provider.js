import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  normalizeCheckRow,
  normalizeClaimRow,
  normalizeClaimRuleRow,
  normalizeDraftRow,
  normalizeProductRow,
  statusForVerdict,
} from "../listing-model.js?v=0.1.0";

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

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields). `fieldsOverride` is a partial
// fields{} object (title/bullets/description/...) coming from the review
// workbench's "Save edits" button; it is merged onto the draft's current
// fields before re-encoding the array fields back to JSON.
function baseDraftFields(row, fieldsOverride) {
  const currentFields = normalizeDraftRow(row).fields;
  const nextFields = { ...currentFields, ...(fieldsOverride || {}) };
  return {
    draft_id: row.draft_id,
    ref: row.ref,
    product_id: row.product_id,
    platform: row.platform,
    locale: row.locale || "",
    variant_group: row.variant_group || "",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    keyword_strategy: row.keyword_strategy || "",
    title: nextFields.title || "",
    subtitle: nextFields.subtitle || "",
    bullets: JSON.stringify(nextFields.bullets || []),
    description: nextFields.description || "",
    search_terms: nextFields.search_terms || "",
    seo_title: nextFields.seo_title || "",
    seo_description: nextFields.seo_description || "",
    selling_points: JSON.stringify(nextFields.selling_points || []),
    aplus_outline: JSON.stringify(nextFields.aplus_outline || []),
    item_specifics: JSON.stringify(nextFields.item_specifics || []),
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [products, drafts, checks, claims, claimRules, settings] = await Promise.all([
      readAllRecords("products"),
      readAllRecords("drafts"),
      readAllRecords("checks"),
      readAllRecords("claims"),
      readAllRecords("claim-rules"),
      readSettingsRow(),
    ]);
    const normalizedProducts = products.map(normalizeProductRow);
    const normalizedDrafts = drafts.map(normalizeDraftRow);
    const snapshot = assembleSnapshot({
      products: normalizedProducts,
      drafts: normalizedDrafts,
      checks: checks.map(normalizeCheckRow),
      configSummary: buildConfigSummary({ settings }),
    });
    return {
      app: "kelly-listing",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: normalizedDrafts.length > 0, config_version: "1" },
      lock: null,
      config_summary: buildConfigSummary({ settings }),
      claims: {
        updated_at: new Date().toISOString(),
        claims: claims.map(normalizeClaimRow),
        rules: claimRules.map(normalizeClaimRuleRow),
      },
      snapshot,
    };
  },

  // Human verdict on a draft, written directly onto the draft record. Ported
  // from the retired local-file DataProvider's applyDecision(): every action
  // (including "revise") maps through statusForVerdict()'s table and is
  // recorded literally as decision_action — this simplifies away the retired
  // local-file provider's "revise preserves the prior real verdict" special
  // case, since Busabase reads are always live and there is no staleness
  // left to paper over. "revise" also carries edited fields from the review
  // workbench's field editor (title/bullets/description/...).
  async decideDraft({ draft_id, action, note = "", fields } = {}) {
    if (!draft_id || typeof draft_id !== "string") throw new Error("draft_id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("drafts", "draft-id", draft_id);
    if (!existing) throw new Error(`Unknown draft: ${draft_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const nextFields = {
      ...baseDraftFields(current, fields),
      draft_id,
      status: statusForVerdict(action, current.status || "needs_review"),
      decision_action: action,
      decision_note: String(note || ""),
      decided_at: now,
      updated_at: now,
    };
    await upsert("drafts", "draft-id", draft_id, nextFields, `Decision on draft ${draft_id}: ${action}`);
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
