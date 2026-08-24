import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  CANDIDATE_ACTIONS,
  DECISION_KINDS,
  PROPOSAL_ACTIONS,
  TREND_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  stageForCandidateAction,
  statusForProposalAction,
} from "../picks-model.js?v=0.1.0";

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
    const [candidates, trend_items, proposals, sources, sync_log, settings] = await Promise.all([
      readAllRecords("candidates"),
      readAllRecords("trend-items"),
      readAllRecords("proposals"),
      readAllRecords("sources"),
      readAllRecords("sync-log"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({
      candidates,
      trend_items,
      proposals,
      sources,
      sync_log,
      base_currency: settings.base_currency || "USD",
    });
    const config_summary = buildConfigSummary({ settings, sources: snapshot.sources });
    return {
      app: "kelly-picks",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: candidates.length > 0 || sources.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on a candidate (develop/watch/drop), a proposal review
  // (approve/request_changes/revise/block), or a trend promotion — written
  // directly onto the item record. Ported from the retired local-file
  // DataProvider's saveDecision(): candidate actions map to `stage` via
  // stageForCandidateAction(), proposal actions map to `status` via
  // statusForProposalAction(); a "revise" action only rewrites `brief`
  // without changing `status`.
  async saveDecision({ kind = "", id = "", action = "", comment = "", brief } = {}) {
    if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
    if (!id) return { ok: false, status: 400, error: "Missing item id" };
    const allowed = kind === "candidate" ? CANDIDATE_ACTIONS : kind === "proposal" ? PROPOSAL_ACTIONS : TREND_ACTIONS;
    if (!allowed.includes(action)) return { ok: false, status: 400, error: `Unknown action for ${kind}: ${action}` };
    await ensureResources();
    const now = new Date().toISOString();

    try {
      if (kind === "candidate") {
        const existing = await findRecord("candidates", "candidate-id", id);
        if (!existing) throw new Error(`Unknown candidate: ${id}`);
        const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
        await upsert(
          "candidates",
          "candidate-id",
          id,
          {
            ...current,
            candidate_id: id,
            stage: stageForCandidateAction(action),
            verdict_action: action,
            verdict_comment: comment,
            verdict_decided_at: now,
            last_updated: now,
          },
          `Verdict on candidate ${id}: ${action}`,
        );
      } else if (kind === "proposal") {
        const existing = await findRecord("proposals", "proposal-id", id);
        if (!existing) throw new Error(`Unknown proposal: ${id}`);
        const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
        if (current.status === "done") throw new Error(`Proposal ${id} is already done and cannot be re-decided`);
        const next = { ...current, proposal_id: id };
        if (typeof brief === "string") next.brief = brief;
        if (action !== "revise") {
          next.status = statusForProposalAction(action);
          next.review_comment = comment;
          next.review_decided_at = now;
        }
        await upsert("proposals", "proposal-id", id, next, `Decision on proposal ${id}: ${action}`);
      } else if (kind === "trend") {
        const existing = await findRecord("trend-items", "trend-id", id);
        if (!existing) throw new Error(`Unknown trend item: ${id}`);
        const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
        await upsert(
          "trend-items",
          "trend-id",
          id,
          { ...current, trend_id: id, promotion_action: action, promotion_comment: comment, promotion_decided_at: now },
          `Promotion decision on trend ${id}: ${action}`,
        );
      }
    } catch (error) {
      return { ok: false, status: 400, error: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true, decision: { id, kind, action, comment, decided_at: now } };
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
