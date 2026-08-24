// Pure domain logic for kelly-inquiry. recomputeMetrics, refreshInquiryDerived,
// applyMinPriceGuard, and recomputeQuoteTotals are ported verbatim (same
// variable names, same order of operations, only TS types stripped) from the
// retired lib/data-provider/store-core.ts — the pipeline/stage-heuristic and
// quote-worksheet math is unchanged. statusForAction is ported verbatim from
// the retired lib/data-provider/local-file-provider.ts's decideApproval(): the
// action -> approval.status mapping. staleInquiries/isFollowUpOverdue/
// unansweredNew/oldestUnanswered are ported verbatim from the retired
// app/app.js (same filters, same sort order). normalizeAccount/
// normalizeInquiry/normalizeMessage/normalizeProduct/normalizeQuote/
// normalizeApproval and buildSnapshot/buildConfigSummary are new: they turn
// Busabase accounts/inquiries/messages/products/quotes/approvals/sync_log/
// settings rows (already snake_cased by the provider) into the
// InquirySnapshot/ConfigSummary shapes documented in
// references/inquiry-schema.md.

export const STAGES = ["new", "replied", "quoted", "negotiating", "won", "lost"];
export const ACTIVE_STAGES = ["new", "replied", "quoted", "negotiating"];
export const FUNNEL_STAGES = ["new", "replied", "quoted", "negotiating", "won"];
export const CHANNELS = ["whatsapp", "instagram", "messenger", "email"];
export const CONNECTORS = [
  "whatsapp_cloud",
  "instagram_graph",
  "messenger_graph",
  "email_agent",
  "browser_agent",
  "manual",
];
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "expired", "declined"];
export const APPROVAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const PENDING_APPROVAL_STATUSES = ["needs_review", "changes_requested", "approved"];
export const APPROVAL_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
export const SECRET_ENV_KEYS = ["access_token_env", "phone_number_id_env", "ig_user_id_env", "page_id_env"];

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// decideApproval(): approve/request_changes/block change status; "revise" (a
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
  phone_number_id = "",
  ig_user_id_env = "",
  page_id_env = "",
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
    phone_number_id,
    ig_user_id_env,
    page_id_env,
    inquiry_count: 0,
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

export function normalizeProduct({
  product_id = "",
  sku = "",
  name = "",
  category = "",
  moq = 0,
  price_min = "",
  price_max = "",
  currency = "USD",
  lead_time_days = 0,
  specs = "",
  faq = "",
} = {}) {
  return {
    product_id,
    sku,
    name,
    category,
    moq: Number(moq) || 0,
    price_min: price_min === "" || price_min === undefined ? undefined : Number(price_min),
    price_max: price_max === "" || price_max === undefined ? undefined : Number(price_max),
    currency: currency || "USD",
    lead_time_days: Number(lead_time_days) || 0,
    specs: parseJsonObject(specs) || {},
    faq: parseJsonList(faq),
  };
}

export function normalizeQuote({
  quote_id = "",
  quote_no = "",
  inquiry_id = "",
  customer = "",
  currency = "USD",
  status = "draft",
  issue_date = "",
  valid_until = "",
  items = "",
  subtotal = 0,
  total = 0,
  terms = "",
  pricing_notes = "",
  pricing_alerts = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    quote_id,
    quote_no,
    inquiry_id,
    customer,
    currency: currency || "USD",
    status: QUOTE_STATUSES.includes(status) ? status : "draft",
    issue_date,
    valid_until,
    items: parseJsonList(items),
    subtotal: Number(subtotal) || 0,
    total: Number(total) || 0,
    terms,
    pricing_notes,
    pricing_alerts: parseJsonList(pricing_alerts),
    created_at,
    updated_at: updated_at || created_at,
  };
}

export function normalizeInquiry({
  inquiry_id = "",
  account_id = "",
  channel = "",
  customer_name = "",
  customer_company = "",
  customer_country = "",
  customer_source = "",
  product_interest = "",
  product_ids = "",
  quote_ids = "",
  stage = "new",
  value_estimate = 0,
  currency = "USD",
  owner = "Kelly",
  unread = "",
  created_at = "",
  next_follow_up = "",
  provider_conversation_id = "",
  suggested_reply = "",
  updated_at = "",
} = {}) {
  return {
    inquiry_id,
    account_id,
    channel,
    customer: { name: customer_name, company: customer_company, country: customer_country, source: customer_source },
    product_interest,
    product_ids: parseJsonList(product_ids),
    quote_ids: parseJsonList(quote_ids),
    stage: STAGES.includes(stage) ? stage : "new",
    value_estimate: Number(value_estimate) || 0,
    currency: currency || "USD",
    owner: owner || "Kelly",
    unread: toBool(unread),
    created_at,
    last_message_at: "",
    last_incoming_at: "",
    next_follow_up,
    provider_conversation_id,
    suggested_reply,
    messages: [],
    updated_at: updated_at || created_at,
  };
}

export function normalizeApproval({
  item_id = "",
  kind = "reply",
  inquiry_id = "",
  quote_id = "",
  account_id = "",
  channel = "",
  customer = "",
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
} = {}) {
  return {
    item_id,
    ref: 0,
    kind: kind || "reply",
    inquiry_id,
    quote_id,
    account_id,
    channel,
    customer,
    text,
    note,
    reason,
    suggested_by: suggested_by || "human",
    status: APPROVAL_STATUSES.includes(status) ? status : "needs_review",
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
  };
}

// Ported from the retired local-file-provider.ts's approval.ref assignment
// (nextRef()), adapted for Busabase reads that have no guaranteed insertion
// order: refs are assigned by a stable created_at ascending sort so
// "Reply #N" / "Quote #N" stays put across reloads regardless of the page
// order records.list returns.
function withApprovalRefs(approvals) {
  const ordered = approvals
    .slice()
    .sort((a, b) => String(a.created_at || a.item_id).localeCompare(String(b.created_at || b.item_id)));
  const refById = new Map(ordered.map((item, index) => [item.item_id, index + 1]));
  return approvals.map((item) => ({ ...item, ref: refById.get(item.item_id) || 0 }));
}

// ---- Pipeline / stage math, ported verbatim from store-core.ts ----

export function refreshInquiryDerived(inquiry) {
  const messages = Array.isArray(inquiry.messages) ? inquiry.messages : [];
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  if (last) inquiry.last_message_at = last.sent_at;
  if (lastIncoming) inquiry.last_incoming_at = lastIncoming.sent_at;
  // Stage heuristic: a "new" inquiry that already has an outgoing reply is at least "replied".
  if (inquiry.stage === "new" && messages.some((message) => message.direction === "outgoing")) {
    inquiry.stage = "replied";
  }
  return inquiry;
}

export function applyMinPriceGuard(quote, products = []) {
  const byId = new Map((products || []).map((product) => [product.product_id, product]));
  quote.pricing_alerts = [];
  for (const line of quote.items || []) {
    const product = line.product_id ? byId.get(line.product_id) : undefined;
    if (!product || typeof product.price_min !== "number") continue;
    if (Number(line.unit_price) < product.price_min) {
      quote.pricing_alerts.push({
        product_id: product.product_id,
        sku: product.sku,
        unit_price: Number(line.unit_price),
        price_min: product.price_min,
        message: `${product.sku}: unit price ${line.unit_price} is below the KB floor ${product.price_min}.`,
      });
    }
  }
  return quote;
}

export function recomputeQuoteTotals(quote) {
  let subtotal = 0;
  for (const line of quote.items || []) {
    line.qty = Number(line.qty) || 0;
    line.unit_price = Number(line.unit_price) || 0;
    line.total = Number((line.qty * line.unit_price).toFixed(2));
    subtotal += line.total;
  }
  quote.subtotal = Number(subtotal.toFixed(2));
  quote.total = quote.subtotal;
  return quote;
}

// Ported verbatim from the retired app/app.js's staleDeals()/isFollowUpOverdue():
// a deal is stale once it is still in an active stage AND its next_follow_up
// date has passed relative to the reference time (snapshot.generated_at in
// demo mode, otherwise "now").
export function isFollowUpOverdue(inquiry, referenceIso) {
  if (!inquiry.next_follow_up) return false;
  const today = new Date(referenceIso || Date.now()).toISOString().slice(0, 10);
  return ACTIVE_STAGES.includes(inquiry.stage) && inquiry.next_follow_up < today;
}

export function staleInquiries(inquiries = [], referenceIso = "") {
  const today = new Date(referenceIso || Date.now()).toISOString().slice(0, 10);
  return inquiries
    .filter((item) => ACTIVE_STAGES.includes(item.stage) && item.next_follow_up && item.next_follow_up < today)
    .sort((a, b) => String(a.next_follow_up).localeCompare(String(b.next_follow_up)));
}

export function unansweredNew(inquiries = []) {
  return inquiries.filter(
    (item) => item.stage === "new" && !(item.messages || []).some((message) => message.direction === "outgoing"),
  );
}

export function oldestUnanswered(inquiries = []) {
  return (
    unansweredNew(inquiries)
      .filter((item) => item.last_incoming_at)
      .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null
  );
}

// Ported verbatim from the retired lib/data-provider/store-core.ts's
// recomputeMetrics().
export function recomputeMetrics(snapshot) {
  const inquiries = Array.isArray(snapshot.inquiries) ? snapshot.inquiries : [];
  const quotes = Array.isArray(snapshot.quotes) ? snapshot.quotes : [];
  const reference = new Date(snapshot.generated_at || Date.now()).getTime();
  const weekAgo = reference - 7 * 24 * 60 * 60 * 1000;
  const stage_counts = { new: 0, replied: 0, quoted: 0, negotiating: 0, won: 0, lost: 0 };
  const by_channel = {};
  let weekTotal = 0;
  const replyDeltas = [];
  for (const inquiry of inquiries) {
    if (stage_counts[inquiry.stage] !== undefined) stage_counts[inquiry.stage] += 1;
    const createdAt = new Date(inquiry.created_at || inquiry.last_message_at || 0).getTime();
    if (createdAt >= weekAgo && createdAt <= reference) {
      weekTotal += 1;
      by_channel[inquiry.channel] = (by_channel[inquiry.channel] || 0) + 1;
    }
    const messages = Array.isArray(inquiry.messages) ? inquiry.messages : [];
    const firstIncoming = messages.find((message) => message.direction === "incoming");
    const firstOutgoing = messages.find((message) => message.direction === "outgoing");
    if (firstIncoming && firstOutgoing) {
      const delta = (new Date(firstOutgoing.sent_at).getTime() - new Date(firstIncoming.sent_at).getTime()) / 60000;
      if (Number.isFinite(delta) && delta >= 0) replyDeltas.push(delta);
    }
  }
  replyDeltas.sort((a, b) => a - b);
  const median = replyDeltas.length ? replyDeltas[Math.floor((replyDeltas.length - 1) / 2)] : 0;
  const closed = stage_counts.won + stage_counts.lost;
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    inquiry_count: inquiries.length,
    quote_count: quotes.length,
    product_count: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
    unanswered_new_count: unansweredNew(inquiries).length,
    quotes_sent: quotes.filter((quote) => ["sent", "accepted", "expired", "declined"].includes(quote.status)).length,
    win_rate: closed ? Number((stage_counts.won / closed).toFixed(2)) : 0,
    reply_median_minutes: Math.round(median),
    inquiries_this_week: { total: weekTotal, by_channel },
    stage_counts,
  };
  return snapshot;
}

// Warnings are derived, never stored: an aggregate stale-deals warning plus
// one warning per quote that is "sent" and past its valid_until with no reply.
function buildWarnings(inquiries, quotes, referenceIso) {
  const warnings = [];
  const stale = staleInquiries(inquiries, referenceIso);
  if (stale.length) {
    warnings.push({
      id: "stale-deals-batch",
      severity: "warning",
      message: `${stale.length} deal(s) are past their follow-up SLA.`,
      detail: `See the overview panel — the oldest is ${stale[0].inquiry_id} (due ${stale[0].next_follow_up}).`,
    });
  }
  const today = new Date(referenceIso || Date.now()).toISOString().slice(0, 10);
  for (const quote of quotes) {
    if (quote.status === "sent" && quote.valid_until && quote.valid_until < today) {
      warnings.push({
        id: `${quote.quote_id}-expired`,
        severity: "warning",
        message: `Quote ${quote.quote_no} for ${quote.customer} expired on ${quote.valid_until} with no reply.`,
        detail: "",
      });
    }
  }
  return warnings;
}

// Assemble the full InquirySnapshot from raw Busabase rows (already
// snake_cased by busabase-provider.js's normalizeFields()). messages are
// grouped by inquiry-id into each inquiry's messages[], mirroring the
// retired local-file-provider's snapshot shape exactly: last_message_at/
// last_incoming_at and the stage heuristic are derived via
// refreshInquiryDerived(), and warnings are computed live, never stored.
/**
 * @param {{
 *   accounts?: Array<Record<string, any>>,
 *   inquiries?: Array<Record<string, any>>,
 *   messages?: Array<Record<string, any>>,
 *   products?: Array<Record<string, any>>,
 *   quotes?: Array<Record<string, any>>,
 *   approvals?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 * }} [args]
 */
export function buildSnapshot({
  accounts = [],
  inquiries = [],
  messages = [],
  products = [],
  quotes = [],
  approvals = [],
  sync_log = [],
} = {}) {
  const normalizedProducts = products.map(normalizeProduct);
  const normalizedQuotes = quotes.map(normalizeQuote).map((quote) => {
    recomputeQuoteTotals(quote);
    applyMinPriceGuard(quote, normalizedProducts);
    return quote;
  });

  const messagesByInquiry = new Map();
  for (const row of messages) {
    const message = normalizeMessage(row);
    const key = row.inquiry_id || "";
    if (!messagesByInquiry.has(key)) messagesByInquiry.set(key, []);
    messagesByInquiry.get(key).push(message);
  }

  const now = new Date().toISOString();
  const normalizedInquiries = inquiries.map(normalizeInquiry);
  for (const inquiry of normalizedInquiries) {
    const items = (messagesByInquiry.get(inquiry.inquiry_id) || []).sort((a, b) =>
      String(a.sent_at).localeCompare(String(b.sent_at)),
    );
    inquiry.messages = items;
    refreshInquiryDerived(inquiry);
  }
  normalizedInquiries.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));

  const normalizedAccounts = accounts.map(normalizeAccount).map((account) => {
    const owned = normalizedInquiries.filter((item) => item.account_id === account.account_id);
    return { ...account, inquiry_count: owned.length, unread_count: owned.filter((item) => item.unread).length };
  });

  const normalizedApprovals = withApprovalRefs(approvals.map(normalizeApproval));

  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-inquiry",
    base_currency: "USD",
    metrics: {},
    accounts: normalizedAccounts,
    inquiries: normalizedInquiries,
    quotes: normalizedQuotes,
    products: normalizedProducts,
    approvals: normalizedApprovals,
    sync_log: [...sync_log].sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))),
    warnings: buildWarnings(normalizedInquiries, normalizedQuotes, now),
  };
  recomputeMetrics(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — never exposes secret values, only
// the env-var *name* an account's token lives in (matching the retired
// summarizeConfig()'s secret_envs exposure). secrets_ready is a status proxy,
// not a live process.env check: the browser has no access to process.env,
// only the trusted scripts (a Node process) can verify a token is actually
// set, and they record the outcome on account.status ("ok"/"warning") after
// each sync attempt.
/**
 * @param {{ settings?: Record<string, any>, accounts?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, accounts = [] } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    quote_defaults: parseJsonObject(settings.quote_defaults),
    follow_up: parseJsonObject(settings.follow_up),
    reply_style: parseJsonObject(settings.reply_style),
    product_kb: settings.kb_source_path ? { source_path: settings.kb_source_path } : null,
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
