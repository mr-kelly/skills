// Pure domain logic for kelly-support. runQualityGate, refreshTicketDerived,
// and deriveCsatTrend are ported verbatim (same variable names, same order of
// operations, only TS types stripped) from the retired
// lib/data-provider/store-core.ts — the SLA/CSAT/quality-gate math is
// unchanged. statusForAction is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's decideApproval(): the
// action -> ticket.status mapping (a "revise" verdict is a draft-text save
// that never changes status). normalizeTicket/normalizeMessage/
// normalizeAccount/normalizeKbArticle and buildSnapshot/buildConfigSummary
// are new: they turn Busabase accounts/tickets/messages/knowledge_base/
// sync_log/settings rows (already snake_cased by the provider) into the
// SupportSnapshot/ConfigSummary shapes documented in
// references/support-schema.md.

export const TICKET_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const OPEN_STATUSES = ["needs_review", "changes_requested", "approved"];
export const CHANNELS = ["email", "whatsapp", "webchat", "form", "wechat"];
export const CONNECTORS = ["email_agent", "whatsapp_cloud", "webchat_widget", "form_intake", "wechat_work", "manual"];
export const CATEGORIES = ["bug", "how_to", "billing", "refund", "complaint", "feature"];
export const PRIORITIES = ["urgent", "high", "normal", "low"];
export const PROPOSED_ACTIONS = ["send_reply", "escalate", "refund", "close", "no_action"];
export const GATE_VERDICTS = ["ship", "fix", "block"];
// Actions that always require an explicit human approval (high-risk).
export const APPROVAL_REQUIRED_ACTIONS = ["refund", "escalate"];
export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);
export const SECRET_ENV_KEYS = ["access_token_env", "phone_number_id_env", "corp_secret_env"];

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// decideApproval(): approve/request_changes/block change status; "revise" (a
// human edit of the draft without a verdict) never changes status.
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

function parseJsonObject(value = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toBool(value) {
  return value === true || value === "true";
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

export function normalizeAccount({
  account_id = "",
  channel = "",
  connector = "",
  display_name = "",
  handle = "",
  status = "",
  access_token_env = "",
  phone_number_id_env = "",
  corp_secret_env = "",
  last_sync_at = "",
} = {}) {
  return {
    account_id,
    channel,
    connector: connector || "manual",
    display_name: display_name || account_id,
    handle,
    status: status || "ok",
    access_token_env,
    phone_number_id_env,
    corp_secret_env,
    ticket_count: 0,
    unread_count: 0,
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

export function normalizeKbArticle({
  article_id = "",
  kind = "article",
  title = "",
  body = "",
  tags = "",
  category = "",
  updated_at = "",
} = {}) {
  return { article_id, kind, title, body, tags: parseJsonList(tags), category, updated_at };
}

export function normalizeTicket({
  ticket_id = "",
  account_id = "",
  channel = "",
  customer_name = "",
  customer_company = "",
  customer_email = "",
  customer_handle = "",
  customer_country = "",
  customer_plan = "",
  subject = "",
  body = "",
  category = "how_to",
  priority = "normal",
  status = "needs_review",
  proposed_action = "send_reply",
  reason = "",
  suggested_reply = "",
  kb_refs = "",
  sla_policy = "",
  sla_due_by = "",
  sla_first_response_at = "",
  csat_score = "",
  csat_comment = "",
  csat_rated_at = "",
  owner = "Kelly",
  unread = "",
  created_at = "",
  provider_conversation_id = "",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_connector = "",
  execution_target = "",
  execution_tier = "",
  execution_amount = "",
  execution_detail = "",
  executed_at = "",
  updated_at = "",
} = {}) {
  return {
    ticket_id,
    ref: 0,
    account_id,
    channel,
    customer: {
      name: customer_name,
      company: customer_company,
      email: customer_email,
      handle: customer_handle,
      country: customer_country,
      plan: customer_plan,
    },
    subject,
    body,
    category: category || "how_to",
    priority: priority || "normal",
    status: TICKET_STATUSES.includes(status) ? status : "needs_review",
    proposed_action: proposed_action || "send_reply",
    reason,
    suggested_reply,
    kb_refs: parseJsonList(kb_refs),
    sla: {
      policy: sla_policy || "first_response",
      due_by: sla_due_by || "",
      breached: false,
      first_response_at: sla_first_response_at || "",
    },
    csat:
      csat_score !== "" && csat_score !== undefined && csat_score !== null
        ? { score: Number(csat_score) || 0, comment: csat_comment || "", rated_at: csat_rated_at || "" }
        : null,
    quality_gate: null,
    owner: owner || "Kelly",
    unread: toBool(unread),
    created_at,
    last_message_at: "",
    last_incoming_at: "",
    provider_conversation_id,
    decision: decision_action ? { action: decision_action, comment: decision_comment, decided_at } : null,
    execution: execution_status
      ? {
          status: execution_status,
          operation: execution_operation,
          connector: execution_connector,
          channel,
          target: execution_target,
          tier: execution_tier,
          amount: execution_amount !== "" ? Number(execution_amount) || 0 : undefined,
          detail: execution_detail,
          executed_at,
        }
      : null,
    messages: [],
    updated_at: updated_at || created_at,
  };
}

// Ported from the retired local-file-provider.ts's ticket.ref assignment,
// adapted for Busabase reads that have no guaranteed insertion order: refs
// are assigned by a stable created_at ascending sort so "#N" stays put across
// reloads regardless of the page order records.list returns.
function withTicketRefs(tickets) {
  const ordered = tickets
    .slice()
    .sort((a, b) => String(a.created_at || a.ticket_id).localeCompare(String(b.created_at || b.ticket_id)));
  const refById = new Map(ordered.map((ticket, index) => [ticket.ticket_id, index + 1]));
  return tickets.map((ticket) => ({ ...ticket, ref: refById.get(ticket.ticket_id) || 0 }));
}

// ---- The support-qa quality gate ----
//
// A pre-send CSAT-risk / policy gate. Runs against a ticket + its proposed reply
// and returns SHIP / FIX / BLOCK. It BLOCKS sends that promise refunds or make
// commitments without approval, or that lack grounding / contradict the KB. It
// never sends; a human still approves. decideApproval and the executor both
// re-check the gate so a BLOCK is a hard stop even if a stale approve exists.

const COMMITMENT_PATTERNS =
  /\b(refund|money back|reimburse|compensat|guarantee|we (?:will|'ll) (?:refund|credit|waive|comp)|credit your account|free month|discount code|coupon)\b/i;

export function runQualityGate(ticket = {}, kb = [], risk = {}) {
  const reply = String(ticket.suggested_reply || "");
  const kbIds = new Set((kb || []).map((a) => a.article_id));
  const refs = Array.isArray(ticket.kb_refs) ? ticket.kb_refs : [];
  const validRefs = refs.filter((id) => kbIds.has(id));
  const checks = [];

  // 1. Grounding: a substantive reply should cite at least one real KB article.
  const grounded = validRefs.length > 0 || reply.trim().length < 40;
  checks.push({
    id: "grounding",
    ok: grounded,
    message: grounded
      ? validRefs.length
        ? `Reply cites ${validRefs.length} KB article(s).`
        : "Short acknowledgement — grounding not required."
      : "Reply is substantive but cites no valid KB article. Ground it or mark for human review.",
  });

  // 2. Dangling refs: every cited ref must resolve to a real article.
  const danglingRefs = refs.filter((id) => !kbIds.has(id));
  checks.push({
    id: "kb_refs_resolve",
    ok: danglingRefs.length === 0,
    message: danglingRefs.length
      ? `Cites unknown KB article(s): ${danglingRefs.join(", ")}.`
      : "All cited KB refs resolve.",
  });

  // 3. Commitments / refunds: a reply that promises a refund or makes a
  //    commitment is a hard stop unless the ticket is an approved refund action.
  const makesCommitment = COMMITMENT_PATTERNS.test(reply);
  const refundApproved = ticket.proposed_action === "refund" && ticket.status === "approved";
  const commitmentsGuarded = risk?.block_commitments_without_approval !== false;
  const commitmentOk = !makesCommitment || refundApproved || !commitmentsGuarded;
  checks.push({
    id: "no_unapproved_commitment",
    ok: commitmentOk,
    message: commitmentOk
      ? makesCommitment
        ? "Commitment present but on an approved refund/action."
        : "No refund or commitment language detected."
      : "Reply promises a refund/commitment without an approved refund action. Requires human approval.",
  });

  // 4. Refund policy: a refund action above the auto cap needs approval.
  const refundOk =
    ticket.proposed_action !== "refund" ||
    (risk?.refund_requires_approval === false &&
      (risk?.max_auto_refund === undefined || Number(ticket.execution?.amount || 0) <= Number(risk.max_auto_refund)));
  checks.push({
    id: "refund_policy",
    ok: refundOk || ticket.status === "approved",
    message:
      ticket.proposed_action === "refund"
        ? ticket.status === "approved"
          ? "Refund explicitly approved by a human."
          : "Refund action requires human approval before sending."
        : "No refund requested.",
  });

  const hardBlocks = checks.filter((c) => (c.id === "no_unapproved_commitment" || c.id === "refund_policy") && !c.ok);
  const softFixes = checks.filter((c) => (c.id === "grounding" || c.id === "kb_refs_resolve") && !c.ok);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  let verdict = "ship";
  let summary = "Reply is grounded and within policy — ready to approve and send.";
  if (hardBlocks.length) {
    verdict = "block";
    summary = hardBlocks.map((c) => c.message).join(" ");
  } else if (softFixes.length) {
    verdict = "fix";
    summary = softFixes.map((c) => c.message).join(" ");
  }
  return { verdict, score, summary, checks };
}

// SLA breach is derived, never trusted from input: a ticket breaches when it is
// still open and its due_by has passed relative to the reference time.
export function refreshTicketDerived(ticket, referenceIso) {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  if (last) ticket.last_message_at = last.sent_at;
  if (lastIncoming) ticket.last_incoming_at = lastIncoming.sent_at;
  const firstOutgoing = messages.find((message) => message.direction === "outgoing");
  if (ticket.sla && !ticket.sla.first_response_at && firstOutgoing) {
    ticket.sla.first_response_at = firstOutgoing.sent_at;
  }
  if (ticket.sla?.due_by) {
    const reference = new Date(referenceIso || Date.now()).getTime();
    const open = ticket.status !== "done" && ticket.status !== "blocked";
    const answered = Boolean(ticket.sla.first_response_at);
    ticket.sla.breached = open && !answered && new Date(ticket.sla.due_by).getTime() < reference;
  }
  return ticket;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function deriveCsatTrend(tickets) {
  const rated = tickets
    .filter((t) => t.csat && typeof t.csat.score === "number" && t.csat.rated_at)
    .sort((a, b) => String(a.csat?.rated_at).localeCompare(String(b.csat?.rated_at)));
  return rated.slice(-6).map((t, index) => ({
    label: `#${index + 1}`,
    score: Number(t.csat?.score) || 0,
  }));
}

// Ported (adapted for a Busabase-live reference time) from the retired
// lib/data-provider/store-core.ts's recomputeMetrics().
export function recomputeMetrics(snapshot) {
  const tickets = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
  const kb = Array.isArray(snapshot.knowledge_base) ? snapshot.knowledge_base : [];
  const reference = new Date(snapshot.generated_at || Date.now()).getTime();
  const weekAgo = reference - 7 * 24 * 60 * 60 * 1000;
  const status_counts = { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 };
  const by_category = {};
  const by_channel = {};
  let weekTotal = 0;
  const responseDeltas = [];
  const csatScores = [];
  for (const ticket of tickets) {
    if (status_counts[ticket.status] !== undefined) status_counts[ticket.status] += 1;
    by_category[ticket.category] = (by_category[ticket.category] || 0) + 1;
    const createdAt = new Date(ticket.created_at || ticket.last_message_at || 0).getTime();
    if (createdAt >= weekAgo && createdAt <= reference) {
      weekTotal += 1;
      by_channel[ticket.channel] = (by_channel[ticket.channel] || 0) + 1;
    }
    const firstIncoming = (ticket.messages || []).find((m) => m.direction === "incoming");
    const firstOutgoing = (ticket.messages || []).find((m) => m.direction === "outgoing");
    if (firstIncoming && firstOutgoing) {
      const delta = (new Date(firstOutgoing.sent_at).getTime() - new Date(firstIncoming.sent_at).getTime()) / 60000;
      if (Number.isFinite(delta) && delta >= 0) responseDeltas.push(delta);
    }
    if (ticket.csat && typeof ticket.csat.score === "number") csatScores.push(ticket.csat.score);
  }
  const csatAverage = csatScores.length
    ? Number((csatScores.reduce((sum, s) => sum + s, 0) / csatScores.length).toFixed(2))
    : 0;
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    ticket_count: tickets.length,
    kb_count: kb.length,
    open_count: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    awaiting_approval_count: tickets.filter((t) => t.status === "needs_review").length,
    breaching_sla_count: tickets.filter((t) => t.sla?.breached).length,
    resolved_count: tickets.filter((t) => t.status === "done").length,
    csat_average: csatAverage,
    csat_responses: csatScores.length,
    first_response_median_minutes: Math.round(median(responseDeltas)),
    tickets_this_week: { total: weekTotal, by_channel },
    by_category,
    status_counts,
    csat_trend: deriveCsatTrend(tickets),
  };
  return snapshot;
}

// Warnings are derived, never stored: an aggregate SLA-breach warning plus one
// warning per ticket the support-qa gate BLOCKs (that isn't already blocked),
// mirroring the retired app/server/demo.ts's warnings design.
function buildWarnings(tickets) {
  const warnings = [];
  const breaching = tickets
    .filter((t) => t.sla?.breached)
    .sort((a, b) => String(a.sla.due_by).localeCompare(String(b.sla.due_by)));
  if (breaching.length) {
    warnings.push({
      id: "sla-breach-batch",
      severity: "warning",
      message: `${breaching.length} ticket(s) have breached their first-response SLA.`,
      detail: `See the SLA board — the oldest is ${breaching[0].ticket_id} (${breaching[0].priority}, due ${breaching[0].sla.due_by}).`,
    });
  }
  for (const ticket of tickets) {
    if (ticket.quality_gate?.verdict === "block" && ticket.status !== "blocked") {
      warnings.push({
        id: `${ticket.ticket_id}-quality-block`,
        severity: "warning",
        account_id: ticket.account_id,
        message: `Ticket #${ticket.ref} (${ticket.customer?.name || ticket.ticket_id}) is BLOCKED by the support-qa gate.`,
        detail: ticket.quality_gate.summary || "",
      });
    }
  }
  return warnings;
}

// Assemble the full SupportSnapshot from raw Busabase rows (already
// snake_cased by busabase-provider.js's normalizeFields()). Messages are
// grouped by ticket-id into each ticket's messages[]; last_message_at/
// last_incoming_at/sla.breached are derived via refreshTicketDerived(), and
// quality_gate is computed live via runQualityGate() against the current
// knowledge_base + risk_policy — never trusted from a stored value.
/**
 * @param {{
 *   accounts?: Array<Record<string, any>>,
 *   tickets?: Array<Record<string, any>>,
 *   messages?: Array<Record<string, any>>,
 *   knowledge_base?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   risk_policy?: Record<string, any>,
 * }} [args]
 */
export function buildSnapshot({
  accounts = [],
  tickets = [],
  messages = [],
  knowledge_base = [],
  sync_log = [],
  risk_policy = {},
} = {}) {
  const normalizedKb = knowledge_base.map(normalizeKbArticle);

  const messagesByTicket = new Map();
  for (const row of messages) {
    const message = normalizeMessage(row);
    const key = row.ticket_id || "";
    if (!messagesByTicket.has(key)) messagesByTicket.set(key, []);
    messagesByTicket.get(key).push(message);
  }

  const now = new Date().toISOString();
  let normalizedTickets = tickets.map(normalizeTicket);
  for (const ticket of normalizedTickets) {
    const items = (messagesByTicket.get(ticket.ticket_id) || []).sort((a, b) =>
      String(a.sent_at).localeCompare(String(b.sent_at)),
    );
    ticket.messages = items;
    refreshTicketDerived(ticket, now);
    ticket.quality_gate = runQualityGate(ticket, normalizedKb, risk_policy);
  }
  normalizedTickets = withTicketRefs(normalizedTickets);
  normalizedTickets.sort((a, b) =>
    String(b.last_message_at || b.created_at || "").localeCompare(String(a.last_message_at || a.created_at || "")),
  );

  const normalizedAccounts = accounts.map(normalizeAccount).map((account) => {
    const owned = normalizedTickets.filter((item) => item.account_id === account.account_id);
    return { ...account, ticket_count: owned.length, unread_count: owned.filter((item) => item.unread).length };
  });

  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-support",
    metrics: {},
    accounts: normalizedAccounts,
    tickets: normalizedTickets,
    knowledge_base: normalizedKb,
    sync_log: [...sync_log].sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))),
    warnings: buildWarnings(normalizedTickets),
  };
  recomputeMetrics(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — never exposes secret values, only
// the env-var *name* an account's token lives in. secrets_ready is a status
// proxy (the browser has no access to process.env): an account that needs no
// secret (email_agent/form_intake/manual) is always ready; others read the
// account's own `status` field, set by whichever trusted process created it.
/**
 * @param {{ settings?: Record<string, any>, accounts?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, accounts = [] } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    sla_policy: parseJsonObject(settings.sla_policy),
    risk_policy: parseJsonObject(settings.risk_policy) || {},
    reply_style: parseJsonObject(settings.reply_style),
    knowledge_base: settings.kb_source_path ? { source_path: settings.kb_source_path } : null,
    accounts: accounts.map((row) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => row[key]);
      return {
        account_id: row.account_id || "",
        channel: row.channel || "",
        connector: row.connector || "manual",
        display_name: row.display_name || row.account_id || "",
        handle: row.handle || "",
        secret_envs: secretKeys.map((key) => String(row[key])),
        secrets_ready: secretKeys.length === 0 || row.status === "ok",
      };
    }),
  };
}
