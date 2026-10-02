import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  REPLY_ACTIONS,
  buildConfigSummary,
  buildOutbox,
  buildSnapshot,
  normalizeAccount,
  normalizeConversation,
  normalizeMessage,
  normalizeReply,
  statusForAction,
} from "../messenger-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const NORMALIZE_ROW_BY_KEY = {
  accounts: normalizeAccount,
  conversations: normalizeConversation,
  messages: (row) => ({ ...normalizeMessage(row), conversation_id: row.conversation_id || "" }),
  "sync-log": (row) => row,
  replies: normalizeReply,
};

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

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

const countReplyStatus = (status) =>
  countRecords("replies", [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }]);

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
  const { rows } = await readPage("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const keys = ["accounts", "conversations", "messages", "sync-log", "replies"];
    const [
      accountPage,
      conversationPage,
      messagePage,
      syncPage,
      replyPage,
      settings,
      totals,
      unreadCount,
      awaitingCount,
      needsReview,
      approved,
      blocked,
    ] = await Promise.all([
      readPage("accounts"),
      readPage("conversations"),
      readPage("messages"),
      readPage("sync-log"),
      readPage("replies"),
      readSettingsRow(),
      Promise.all(keys.map((key) => countRecords(key))),
      countRecords("conversations", [{ fieldSlug: "unread", fieldType: "checkbox", operator: "is_true" }]),
      countRecords("conversations", [{ fieldSlug: "awaiting-reply", fieldType: "checkbox", operator: "is_true" }]),
      countReplyStatus("needs_review"),
      countReplyStatus("approved"),
      countReplyStatus("blocked"),
    ]);
    const snapshot = buildSnapshot({
      accounts: accountPage.rows,
      conversations: conversationPage.rows,
      messages: messagePage.rows,
      sync_log: syncPage.rows,
    });
    const outbox = buildOutbox({ replies: replyPage.rows });
    const config_summary = buildConfigSummary({ settings, accounts: accountPage.rows });
    if (totals[0] !== null) snapshot.metrics.account_count = totals[0];
    if (totals[1] !== null) snapshot.metrics.conversation_count = totals[1];
    if (totals[2] !== null) snapshot.metrics.message_count = totals[2];
    if (unreadCount !== null) snapshot.metrics.unread_count = unreadCount;
    if (awaitingCount !== null) snapshot.metrics.awaiting_reply_count = awaitingCount;
    return {
      app: "kelly-messenger",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: (totals[0] ?? accountPage.rows.length) > 0, config_version: "1" },
      lock: null,
      config_summary,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
      outbox,
      pagination: Object.fromEntries(
        [
          ["accounts", accountPage],
          ["conversations", conversationPage],
          ["messages", messagePage],
          ["sync-log", syncPage],
          ["replies", replyPage],
        ].map(([key, page]) => [key, page.nextCursor]),
      ),
      totalCount: Object.fromEntries(keys.map((key, index) => [key, totals[index]])),
      workflowCount: { unread: unreadCount, awaiting: awaitingCount, needs_review: needsReview, approved, blocked },
      messageRows: messagePage.rows.map(NORMALIZE_ROW_BY_KEY.messages),
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    return { rows: normalize ? page.rows.map(normalize) : page.rows, nextCursor: page.nextCursor };
  },

  // Ported from the retired local-file provider (lib/data-provider)'s queueReply(): the
  // conversation must already exist (from a prior sync/ingest), the draft
  // text is required, and the new reply is written needs_review.
  async queueReply({ conversation_id, text, note = "", suggested_by = "human" } = {}) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
    await ensureResources();
    const existingConversation = await findRecord("conversations", "conversation-id", conversation_id);
    if (!existingConversation) throw new Error(`Unknown conversation: ${conversation_id}`);
    const conversation = normalizeFields(
      existingConversation.headCommit?.payload ||
        existingConversation.headCommit?.fields ||
        existingConversation.fields,
    );
    const now = new Date().toISOString();
    const replyId = `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
    const fields = {
      reply_id: replyId,
      conversation_id,
      account_id: conversation.account_id || "",
      platform: conversation.platform || "",
      conversation_title: conversation.title || "",
      text: text.trim(),
      note: String(note || ""),
      reason: "Queued from the inbox composer.",
      suggested_by,
      status: "needs_review",
      created_at: now,
      updated_at: now,
    };
    await upsert("replies", "reply-id", replyId, fields, `Queue reply for ${conversation_id}`);
    return { ok: true };
  },

  // Human verdict on a queued reply (approve/request_changes/revise/block),
  // written directly onto the reply record. Ported from the retired
  // local-file provider (lib/data-provider)'s decideReply(): revise is a
  // draft-text save that never changes status; the other three verdicts map
  // to a status transition via statusForAction().
  async decideReply({ reply_id, action, comment = "", text } = {}) {
    if (!REPLY_ACTIONS.has(action)) throw new Error(`Unknown action: ${action}`);
    await ensureResources();
    const existing = await findRecord("replies", "reply-id", reply_id);
    if (!existing) throw new Error(`Unknown reply: ${reply_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      reply_id,
      status: statusForAction(action, current.status || "needs_review"),
      decision_action: action,
      decision_comment: String(comment || ""),
      decided_at: now,
      updated_at: now,
      ...(typeof text === "string" && text.trim() ? { text: text.trim() } : {}),
    };
    await upsert("replies", "reply-id", reply_id, fields, `Decision on reply ${reply_id}: ${action}`);
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
