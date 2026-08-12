import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import {
  DECISION_KINDS,
  DRAFT_ACTIONS,
  REVIEW_ACTIONS,
  buildSnapshot,
  parseBatchMeta,
  statusForAction,
} from "../retail-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp is served through the ambient Busabase session (a Busabase
// iframe/preview host, or same-origin proxy under /api/airapp-preview/); a
// standalone local preview runs on loopback outside that host. A decision
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

async function readBatchMeta() {
  const rows = await readAllRecords("settings");
  const row = rows.find((item) => item.kind === "batch");
  return parseBatchMeta(row?.payload || "");
}

async function requireRecord(key, idFieldSlug, id, label) {
  const existing = await findRecord(key, idFieldSlug, id);
  if (!existing) throw new Error(`Unknown ${label}: ${id}`);
  return { existing, current: normalizeFields(existing.headCommit?.fields || existing.fields) };
}

// signals/actions/drafts enter Busabase only through the agent's own
// browsing-and-writing workflow (see SKILL.md) — the AirApp never creates
// new signal/action/draft rows, it only reads them and writes a human
// verdict directly onto the item's own record. This mirrors the
// review-queue pattern used across this batch of conversions (kelly-radar,
// kelly-picks): the decision is a direct field write, not a separate
// decisions.json-equivalent bucket.
export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [signalRows, actionRows, draftRows, sourceRows, meta] = await Promise.all([
      readAllRecords("signals"),
      readAllRecords("actions"),
      readAllRecords("drafts"),
      readAllRecords("sources"),
      readBatchMeta(),
    ]);
    const batch = buildSnapshot({
      signals: signalRows,
      actions: actionRows,
      drafts: draftRows,
      sources: sourceRows,
      meta,
    });
    return {
      app: "kelly-retail-intel",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(meta.batch_id), config_version: "1" },
      lock: null,
      batch,
    };
  },

  // Human verdict on a signal/action/draft (approve/request_changes/block,
  // plus revise for a draft's edited body) — written directly onto the item
  // record. Ported from the retired local-file store's saveDecision():
  // statusForAction() maps the verb to the item's `status`.
  async saveDecision({ kind = "", id = "", action = "", comment = "", edited_body = "" } = {}) {
    if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
    if (!id) return { ok: false, status: 400, error: "Missing item id" };
    const allowed = kind === "draft" ? DRAFT_ACTIONS : REVIEW_ACTIONS;
    if (!allowed.includes(action)) return { ok: false, status: 400, error: `Unknown action for ${kind}: ${action}` };
    await ensureResources();
    const now = new Date().toISOString();

    try {
      if (kind === "signal") {
        const { current } = await requireRecord("signals", "signal-id", id, "signal");
        await upsert(
          "signals",
          "signal-id",
          id,
          {
            ...current,
            signal_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on signal ${id}: ${action}`,
        );
      } else if (kind === "action") {
        const { current } = await requireRecord("actions", "action-id", id, "action");
        await upsert(
          "actions",
          "action-id",
          id,
          {
            ...current,
            action_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on action ${id}: ${action}`,
        );
      } else if (kind === "draft") {
        const { current } = await requireRecord("drafts", "draft-id", id, "draft");
        await upsert(
          "drafts",
          "draft-id",
          id,
          {
            ...current,
            draft_id: id,
            edited_body: action === "revise" ? edited_body : current.edited_body || "",
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on draft ${id}: ${action}`,
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
