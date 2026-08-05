import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  APP_ID,
  APP_SUBTITLE,
  APP_SUBTITLE_ZH,
  APP_TITLE,
  APP_TITLE_ZH,
  DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  parseJsonValue,
  statusFromDecision,
} from "../matter-strategy-model.js?v=0.1.0";
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
export const isStandaloneLocalRuntime = () => {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
};

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

function buildWorkspace(settings) {
  const jurisdictions = parseJsonValue(settings.default_jurisdictions, []) || [];
  return {
    title: APP_TITLE,
    title_zh: APP_TITLE_ZH,
    subtitle: APP_SUBTITLE,
    subtitle_zh: APP_SUBTITLE_ZH,
    firm: settings.firm_name || "",
    jurisdiction: jurisdictions.join(" / "),
  };
}

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields). The review UI here never edits the
// structured `fields{}` (matter_stage/issue_tree/...) directly — only
// draft/review-note/status change through a decision, so this is a
// pass-through of the row's current raw values plus the decision fields.
function baseItemFields(row) {
  return {
    item_id: row.item_id,
    ref: row.ref || "",
    title: row.title || "",
    category: row.category || "",
    status: row.status || "needs_review",
    owner: row.owner || "",
    risk: row.risk || "[]",
    summary: row.summary || "",
    body: row.body || "",
    recommendation: row.recommendation || "",
    proposed_action: row.proposed_action || "",
    draft: row.draft || "",
    evidence: row.evidence || "[]",
    matter_stage: row.matter_stage || "",
    evidence_gap_count: row.evidence_gap_count ?? "",
    evidence_gaps_list: row.evidence_gaps_list || "[]",
    issue_tree: row.issue_tree || "[]",
    negotiation_options: row.negotiation_options || "[]",
    posture: row.posture || "",
    pleading_outline: row.pleading_outline || "",
    deadline: row.deadline || "",
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
    const [items, entities, checks, settings] = await Promise.all([
      readAllRecords("items"),
      readAllRecords("entities"),
      readAllRecords("checks"),
      readSettingsRow(),
    ]);
    const config_summary = buildConfigSummary({ settings });
    const snapshot = buildSnapshot({ items, entities, checks, workspace: buildWorkspace(settings) });
    return {
      app: APP_ID,
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: items.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on a matter strategy pack, written directly onto the item
  // record. Ported from the retired local-file DataProvider's
  // applyDecision(): every action maps through statusFromDecision()'s table
  // and is recorded literally as decision_action — this simplifies away the
  // retired local-file provider's separate decisions.json bucket and
  // agent_tasks queue, since Busabase reads are always live and nothing in
  // the UI ever read agent_tasks.
  async decideItem({ id, action, comment = "", draft } = {}) {
    if (!id || typeof id !== "string") throw new Error("id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("items", "item-id", id);
    if (!existing) throw new Error(`Unknown item: ${id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const nextStatus = statusFromDecision(action);
    const now = new Date().toISOString();
    const nextFields = {
      ...baseItemFields(current),
      item_id: id,
      status: nextStatus || current.status || "needs_review",
      draft: typeof draft === "string" ? draft : current.draft || "",
      decision_action: action,
      decision_note: String(comment || ""),
      decided_at: now,
      updated_at: now,
    };
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    await runtimeClient.records.changeRequest({
      recordId: existing.id,
      operation: "update",
      fields: toBusabaseFields(nextFields),
      message: `Decision on matter strategy ${id}: ${action}`,
      author: appConfig.appId,
      baseCommitId: existing.headCommitId,
      autoMerge: isStandaloneLocalRuntime(),
    });
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
