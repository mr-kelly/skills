// Pure domain logic for kelly-messenger. recomputeMetrics is ported verbatim
// (same variable names, same order of operations, only TS types stripped)
// from the retired lib/data-provider/common.ts — the metrics math is
// unchanged. statusForAction is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's decideReply(): the
// action -> reply.status mapping. normalizeAccount/normalizeConversation/
// normalizeMessage/normalizeReply and buildSnapshot/buildOutbox/
// buildConfigSummary are new: they turn Busabase
// accounts/conversations/messages/sync_log/replies/settings rows (already
// snake_cased by the provider) into the MessagesSnapshot/Outbox/ConfigSummary
// shapes documented in references/messenger-schema.md.

export const REPLY_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const REPLY_STATUS_SET = new Set(REPLY_STATUSES);
export const PENDING_REPLY_STATUSES = ["needs_review", "changes_requested", "approved"];
export const REPLY_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
export const API_CONNECTORS = new Set(["slack", "discord", "telegram", "whatsapp_cloud"]);
export const SECRET_ENV_KEYS = ["bot_token_env", "user_token_env", "access_token_env", "phone_number_id_env"];

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// decideReply(): approve/request_changes/block change status; "revise" (a
// human edit of the draft without a verdict, labeled "Save edit" in the UI)
// never changes status.
export function statusForAction(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus;
}

function parseJsonList(value = "") {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toBool(value) {
  return value === true || value === "true";
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

export function normalizeAccount({
  account_id = "",
  platform = "",
  connector = "",
  display_name = "",
  workspace = "",
  status = "",
  last_sync_at = "",
} = {}) {
  return {
    account_id,
    platform,
    connector: connector || "manual",
    display_name: display_name || account_id,
    workspace,
    status: status || "not_configured",
    unread_count: 0,
    conversation_count: 0,
    last_sync_at,
  };
}

export function normalizeMessage({
  message_id = "",
  direction = "incoming",
  sender = "",
  text = "",
  sent_at = "",
  attachment = "",
} = {}) {
  return {
    message_id,
    direction: direction === "outgoing" ? "outgoing" : "incoming",
    sender,
    text,
    sent_at,
    attachment,
  };
}

export function normalizeConversation({
  conversation_id = "",
  account_id = "",
  platform = "",
  kind = "",
  title = "",
  channel = "",
  workspace = "",
  participants = "",
  provider_conversation_id = "",
  suggested_reply = "",
  unread = "",
  awaiting_reply = "",
} = {}) {
  return {
    conversation_id,
    account_id,
    platform,
    kind: kind || "dm",
    title: title || conversation_id,
    channel,
    workspace,
    participants: parseJsonList(participants),
    unread: toBool(unread),
    awaiting_reply: toBool(awaiting_reply),
    provider_conversation_id,
    last_message_at: "",
    last_incoming_at: "",
    suggested_reply,
    messages: [],
  };
}

export function normalizeReply({
  reply_id = "",
  conversation_id = "",
  account_id = "",
  platform = "",
  conversation_title = "",
  text = "",
  note = "",
  reason = "",
  suggested_by = "human",
  status = "needs_review",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_connector = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    reply_id,
    ref: 0,
    conversation_id,
    account_id,
    platform,
    conversation_title,
    text,
    note,
    reason,
    suggested_by,
    status: REPLY_STATUS_SET.has(status) ? status : "needs_review",
    decision: decision_action ? { action: decision_action, comment: decision_comment, decided_at } : null,
    execution: execution_status
      ? {
          status: execution_status,
          operation: execution_operation,
          connector: execution_connector,
          target: execution_target,
          detail: execution_detail,
          executed_at,
        }
      : null,
    created_at,
    updated_at: updated_at || created_at,
    __recordId,
    __headCommitId,
  };
}

// Ported from the retired local-file-provider.ts's reply.ref assignment,
// adapted for Busabase reads that have no guaranteed insertion order: refs
// are assigned by a stable created_at ascending sort so "Reply #N" stays put
// across reloads regardless of the page order records.list returns.
function withReplyRefs(replies) {
  const ordered = replies
    .slice()
    .sort((a, b) => String(a.created_at || a.reply_id).localeCompare(String(b.created_at || b.reply_id)));
  const refById = new Map(ordered.map((reply, index) => [reply.reply_id, index + 1]));
  return replies.map((reply) => ({ ...reply, ref: refById.get(reply.reply_id) || 0 }));
}

// Ported verbatim from the retired lib/data-provider/common.ts's
// recomputeMetrics().
export function recomputeMetrics(snapshot = {}) {
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    conversation_count: conversations.length,
    message_count: conversations.reduce((sum, item) => sum + (item.messages?.length || 0), 0),
    unread_count: conversations.filter((item) => item.unread).length,
    awaiting_reply_count: conversations.filter((item) => item.awaiting_reply).length,
  };
  return snapshot;
}

// Assemble the full MessagesSnapshot from raw Busabase rows (already
// snake_cased by busabase-provider.js's normalizeFields()). messages are
// grouped by conversation-id into each conversation's messages[], mirroring
// the retired scripts' baseConversation()/mergeConversations() shape exactly:
// last_message_at/last_incoming_at are derived from the sorted messages, and
// conversations are sorted by latest activity.
/**
 * @param {{
 *   accounts?: Array<Record<string, any>>,
 *   conversations?: Array<Record<string, any>>,
 *   messages?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 * }} [args]
 */
export function buildSnapshot({ accounts = [], conversations = [], messages = [], sync_log = [] } = {}) {
  const normalizedConversations = conversations.map(normalizeConversation);

  const messagesByConversation = new Map();
  for (const row of messages) {
    const message = normalizeMessage(row);
    const key = row.conversation_id || "";
    if (!messagesByConversation.has(key)) messagesByConversation.set(key, []);
    messagesByConversation.get(key).push(message);
  }
  for (const conversation of normalizedConversations) {
    const items = (messagesByConversation.get(conversation.conversation_id) || []).sort((a, b) =>
      String(a.sent_at).localeCompare(String(b.sent_at)),
    );
    conversation.messages = items;
    const last = items[items.length - 1];
    conversation.last_message_at = last?.sent_at || "";
    const lastIncoming = [...items].reverse().find((message) => message.direction === "incoming");
    conversation.last_incoming_at = lastIncoming?.sent_at || "";
  }
  normalizedConversations.sort((a, b) =>
    String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")),
  );

  const normalizedAccounts = accounts.map(normalizeAccount).map((account) => {
    const owned = normalizedConversations.filter((item) => item.account_id === account.account_id);
    return {
      ...account,
      unread_count: owned.filter((item) => item.unread).length,
      conversation_count: owned.length,
    };
  });

  const snapshot = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-messenger",
    metrics: {},
    accounts: normalizedAccounts,
    conversations: normalizedConversations,
    sync_log: [...sync_log].sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))),
    warnings: normalizedAccounts.length
      ? []
      : [{ id: "no-accounts", severity: "info", message: "No accounts configured yet." }],
  };
  recomputeMetrics(snapshot);
  return snapshot;
}

/**
 * @param {{ replies?: Array<Record<string, any>> }} [args]
 */
export function buildOutbox({ replies = [] } = {}) {
  return {
    schema_version: "1",
    updated_at: new Date().toISOString(),
    replies: withReplyRefs(replies.map(normalizeReply)),
  };
}

// Sanitized config summary for #/settings and #/accounts — never exposes
// secret values, only the env-var *name* an account's token lives in
// (matching the retired summarizeConfig()'s secret_envs exposure).
// secrets_ready here is a status proxy, not a live process.env check: the
// browser has no access to process.env, only scripts/sync_messages.mjs (a
// trusted Node process) can verify a token is actually set, and it records
// the outcome on account.status ("ok"/"warning") after each sync attempt.
/**
 * @param {{ settings?: Record<string, any>, accounts?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, accounts = [] } = {}) {
  const hasReplyStyle = Boolean(settings.reply_style_tone || settings.reply_style_language);
  const hasSync = Boolean(settings.sync_default_limit || settings.sync_cadence_minutes);
  return {
    config_path: "busabase",
    is_example: false,
    reply_style: hasReplyStyle
      ? { tone: settings.reply_style_tone || "", language: settings.reply_style_language || "" }
      : null,
    sync: hasSync
      ? {
          default_limit: Number(settings.sync_default_limit) || 0,
          cadence_minutes: Number(settings.sync_cadence_minutes) || 0,
        }
      : null,
    accounts: accounts.map((row) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => row[key]);
      return {
        account_id: row.account_id || "",
        platform: row.platform || "",
        connector: row.connector || "manual",
        display_name: row.display_name || row.account_id || "",
        workspace: row.workspace || "",
        secret_envs: secretKeys.map((key) => String(row[key])),
        secrets_ready: secretKeys.length > 0 && row.status === "ok",
      };
    }),
  };
}
