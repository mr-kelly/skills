import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  BRIEF_ACTIONS,
  DECISION_KINDS,
  OPPORTUNITY_ACTIONS,
  REPORT_ACTIONS,
  SIGNAL_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  statusForAction,
} from "../radar-model.js?v=0.1.0";

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

async function requireRecord(key, idFieldSlug, id, label) {
  const existing = await findRecord(key, idFieldSlug, id);
  if (!existing) throw new Error(`Unknown ${label}: ${id}`);
  return {
    existing,
    current: normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [watchlist, signals, questions, briefs, reports, movers, opportunities, sync_log, settings] =
      await Promise.all([
        readAllRecords("watchlist"),
        readAllRecords("signals"),
        readAllRecords("questions"),
        readAllRecords("briefs"),
        readAllRecords("reports"),
        readAllRecords("movers"),
        readAllRecords("opportunities"),
        readAllRecords("sync-log"),
        readSettingsRow(),
      ]);
    const snapshot = buildSnapshot({
      watchlist,
      signals,
      questions,
      briefs,
      reports,
      movers,
      opportunities,
      sync_log,
    });
    const config_summary = buildConfigSummary({ watchlist: snapshot.watchlist, settings });
    return {
      app: "kelly-radar",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: watchlist.length > 0 || signals.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human verdict on a signal (act/watch/ignore/needs-info), a research brief
  // review (approve/request_changes/block), an opportunity card
  // (approve/ignore), or a report confidence rating (approve, with a 0-5
  // confidence) — written directly onto the item record. Ported from the
  // retired local-file DataProvider's saveDecision(): statusForAction() maps
  // the action to the item's `status` (reports have no status field, only a
  // confidence rating).
  async saveDecision({ kind = "", id = "", action = "", comment = "", confidence } = {}) {
    if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
    if (!id) return { ok: false, status: 400, error: "Missing item id" };
    const allowed =
      kind === "signal"
        ? SIGNAL_ACTIONS
        : kind === "brief"
          ? BRIEF_ACTIONS
          : kind === "opportunity"
            ? OPPORTUNITY_ACTIONS
            : REPORT_ACTIONS;
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
          `Triage on signal ${id}: ${action}`,
        );
      } else if (kind === "brief") {
        const { current } = await requireRecord("briefs", "brief-id", id, "brief");
        await upsert(
          "briefs",
          "brief-id",
          id,
          {
            ...current,
            brief_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on brief ${id}: ${action}`,
        );
      } else if (kind === "opportunity") {
        const { current } = await requireRecord("opportunities", "opportunity-id", id, "opportunity");
        await upsert(
          "opportunities",
          "opportunity-id",
          id,
          {
            ...current,
            opportunity_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on opportunity ${id}: ${action}`,
        );
      } else if (kind === "report") {
        const { current } = await requireRecord("reports", "report-id", id, "report");
        const rating = Number(confidence);
        if (!Number.isFinite(rating)) throw new Error("confidence must be a number between 0 and 5");
        await upsert(
          "reports",
          "report-id",
          id,
          { ...current, report_id: id, confidence: Math.min(5, Math.max(0, rating)), decided_at: now },
          `Confidence rating on report ${id}: ${rating}`,
        );
      }
    } catch (error) {
      return { ok: false, status: 400, error: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true, decision: { id, kind, action, comment, decided_at: now } };
  },

  // Files a follow-up research question, appended onto the parent question's
  // embedded `followups[]` — ported from the retired local-file
  // DataProvider's saveFollowup(), just without the separate
  // app/.data/agent_tasks.json bucket the local-file version used.
  async saveFollowup({ question_id = "", question = "" } = {}) {
    const questionId = String(question_id || "");
    const text = String(question || "").trim();
    if (!questionId || !text) return { ok: false, status: 400, error: "Missing question_id or question" };
    await ensureResources();
    try {
      const { current } = await requireRecord("questions", "question-id", questionId, "question");
      const followups = (() => {
        try {
          const parsed = JSON.parse(current.followups || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      const now = new Date().toISOString();
      const followup = {
        followup_id: `fu-${Date.now().toString(36)}`,
        question: text,
        status: "queued",
        asked_at: now,
      };
      followups.push(followup);
      await upsert(
        "questions",
        "question-id",
        questionId,
        { ...current, question_id: questionId, followups: JSON.stringify(followups) },
        `Follow-up on question ${questionId}`,
      );
      return { ok: true, task: { kind: "research_followup", ref_id: questionId, note: text, status: "queued" } };
    } catch (error) {
      return { ok: false, status: 400, error: error instanceof Error ? error.message : String(error) };
    }
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
