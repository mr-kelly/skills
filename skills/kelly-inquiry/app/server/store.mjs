import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH
} from "./paths.mjs";

export const STAGES = ["new", "replied", "quoted", "negotiating", "won", "lost"];
export const ACTIVE_STAGES = ["new", "replied", "quoted", "negotiating"];
export const CHANNELS = ["whatsapp", "instagram", "messenger", "email"];
export const CONNECTORS = ["whatsapp_cloud", "instagram_graph", "messenger_graph", "email_agent", "browser_agent", "manual"];
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "expired", "declined"];
export const APPROVAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readSnapshot() {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readDecisions() {
  return readJson(DECISIONS_PATH, emptyDecisions());
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export async function readAgentTasks() {
  return readJson(AGENT_TASKS_PATH, { schema_version: "1", updated_at: "", tasks: [] });
}

export async function readExecutionReport() {
  return readJson(EXECUTION_REPORT_PATH, null);
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-inquiry",
    base_currency: "USD",
    metrics: emptyMetrics(),
    accounts: [],
    inquiries: [],
    quotes: [],
    products: [],
    approvals: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No inquiry snapshot exists yet. Configure channels, then ingest collected inquiries with scripts/ingest_inquiries.mjs."
      }
    ]
  };
}

export function emptyDecisions() {
  return { schema_version: "1", updated_at: new Date(0).toISOString(), decisions: {} };
}

export function emptyMetrics() {
  return {
    account_count: 0,
    inquiry_count: 0,
    quote_count: 0,
    product_count: 0,
    unanswered_new_count: 0,
    quotes_sent: 0,
    win_rate: 0,
    reply_median_minutes: 0,
    inquiries_this_week: { total: 0, by_channel: {} },
    stage_counts: { new: 0, replied: 0, quoted: 0, negotiating: 0, won: 0, lost: 0 }
  };
}

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
      const delta = (new Date(firstOutgoing.sent_at) - new Date(firstIncoming.sent_at)) / 60000;
      if (Number.isFinite(delta) && delta >= 0) replyDeltas.push(delta);
    }
  }
  replyDeltas.sort((a, b) => a - b);
  const median = replyDeltas.length
    ? replyDeltas[Math.floor((replyDeltas.length - 1) / 2)]
    : 0;
  const closed = stage_counts.won + stage_counts.lost;
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    inquiry_count: inquiries.length,
    quote_count: quotes.length,
    product_count: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
    unanswered_new_count: inquiries.filter((item) => item.stage === "new" && !(item.messages || []).some((message) => message.direction === "outgoing")).length,
    quotes_sent: quotes.filter((quote) => ["sent", "accepted", "expired", "declined"].includes(quote.status)).length,
    win_rate: closed ? Number((stage_counts.won / closed).toFixed(2)) : 0,
    reply_median_minutes: Math.round(median),
    inquiries_this_week: { total: weekTotal, by_channel },
    stage_counts
  };
  return snapshot;
}

export function mergeInquiries(snapshot, incoming = []) {
  const byId = new Map((snapshot.inquiries || []).map((item) => [item.inquiry_id, item]));
  let newMessages = 0;
  for (const inquiry of incoming) {
    const existing = byId.get(inquiry.inquiry_id);
    if (!existing) {
      byId.set(inquiry.inquiry_id, { ...inquiry, messages: [...(inquiry.messages || [])] });
      newMessages += inquiry.messages?.length || 0;
      continue;
    }
    const seen = new Set((existing.messages || []).map((message) => message.message_id));
    for (const message of inquiry.messages || []) {
      if (seen.has(message.message_id)) continue;
      existing.messages.push(message);
      seen.add(message.message_id);
      newMessages += 1;
    }
    existing.messages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    for (const key of ["customer", "product_interest", "product_ids", "quote_ids", "value_estimate", "currency", "owner", "provider_conversation_id", "next_follow_up", "suggested_reply"]) {
      if (inquiry[key] !== undefined) existing[key] = inquiry[key];
    }
    if (inquiry.stage && STAGES.includes(inquiry.stage)) existing.stage = inquiry.stage;
    if (inquiry.unread !== undefined) existing.unread = inquiry.unread;
    refreshInquiryDerived(existing);
  }
  for (const item of byId.values()) refreshInquiryDerived(item);
  snapshot.inquiries = [...byId.values()].sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")));
  return newMessages;
}

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

function nextRef(snapshot) {
  return (snapshot.approvals || []).reduce((max, item) => Math.max(max, item.ref || 0), 0) + 1;
}

export async function queueReply({ inquiry_id, text, note = "", suggested_by = "human" }) {
  const snapshot = await readSnapshot();
  const inquiry = (snapshot.inquiries || []).find((item) => item.inquiry_id === inquiry_id);
  if (!inquiry) throw new Error(`Unknown inquiry: ${inquiry_id}`);
  if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
  const now = new Date().toISOString();
  const ref = nextRef(snapshot);
  const item = {
    item_id: `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${ref}`,
    ref,
    kind: "reply",
    inquiry_id,
    quote_id: "",
    account_id: inquiry.account_id,
    channel: inquiry.channel,
    customer: [inquiry.customer?.name, inquiry.customer?.company].filter(Boolean).join(" · "),
    text: text.trim(),
    note: String(note || ""),
    reason: "Queued from the inquiry composer.",
    suggested_by,
    status: "needs_review",
    decision: null,
    execution: null,
    created_at: now,
    updated_at: now
  };
  snapshot.approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
  snapshot.approvals.push(item);
  await writeJson(SNAPSHOT_PATH, snapshot);
  return item;
}

export async function decideApproval({ item_id, action, comment = "", text }) {
  const snapshot = await readSnapshot();
  const item = (snapshot.approvals || []).find((entry) => entry.item_id === item_id);
  if (!item) throw new Error(`Unknown approval item: ${item_id}`);
  const now = new Date().toISOString();
  if (typeof text === "string" && text.trim()) item.text = text.trim();
  if (action === "approve") item.status = "approved";
  else if (action === "request_changes") item.status = "changes_requested";
  else if (action === "block") item.status = "blocked";
  else if (action !== "revise") throw new Error(`Unknown action: ${action}`);
  item.decision = { action, comment: String(comment || ""), decided_at: now };
  item.updated_at = now;
  await writeJson(SNAPSHOT_PATH, snapshot);
  const decisions = await readDecisions();
  decisions.decisions[item_id] = {
    action,
    comment: String(comment || ""),
    text: item.text,
    status: item.status,
    decided_at: now
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  if (action === "request_changes") await appendAgentTask(item, comment);
  return item;
}

async function appendAgentTask(item, comment) {
  const tasks = await readAgentTasks();
  const now = new Date().toISOString();
  tasks.tasks.push({
    task_id: `task-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${item.ref}`,
    type: item.kind === "quote" ? "revise_quote" : "revise_reply",
    item_id: item.item_id,
    ref: item.ref,
    inquiry_id: item.inquiry_id,
    quote_id: item.quote_id || "",
    comment: String(comment || ""),
    status: "open",
    requested_at: now
  });
  tasks.updated_at = now;
  await writeJson(AGENT_TASKS_PATH, tasks);
}

export async function setFollowUp({ inquiry_id, next_follow_up }) {
  const snapshot = await readSnapshot();
  const inquiry = (snapshot.inquiries || []).find((item) => item.inquiry_id === inquiry_id);
  if (!inquiry) throw new Error(`Unknown inquiry: ${inquiry_id}`);
  if (next_follow_up && !/^\d{4}-\d{2}-\d{2}$/.test(next_follow_up)) {
    throw new Error("next_follow_up must be YYYY-MM-DD or empty");
  }
  inquiry.next_follow_up = next_follow_up || "";
  await writeJson(SNAPSHOT_PATH, snapshot);
  return inquiry;
}

export function applyMinPriceGuard(quote, products) {
  const byId = new Map((products || []).map((product) => [product.product_id, product]));
  quote.pricing_alerts = [];
  for (const line of quote.items || []) {
    const product = byId.get(line.product_id);
    if (!product || typeof product.price_min !== "number") continue;
    if (Number(line.unit_price) < product.price_min) {
      quote.pricing_alerts.push({
        product_id: product.product_id,
        sku: product.sku,
        unit_price: Number(line.unit_price),
        price_min: product.price_min,
        message: `${product.sku}: unit price ${line.unit_price} is below the KB floor ${product.price_min}.`
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

export async function updateQuote({ quote_id, items, valid_until, terms, pricing_notes }) {
  const snapshot = await readSnapshot();
  const quote = (snapshot.quotes || []).find((entry) => entry.quote_id === quote_id);
  if (!quote) throw new Error(`Unknown quote: ${quote_id}`);
  if (Array.isArray(items)) {
    for (const patch of items) {
      const line = (quote.items || []).find((entry) => entry.line_id === patch.line_id);
      if (!line) continue;
      if (patch.qty !== undefined) line.qty = Number(patch.qty) || 0;
      if (patch.unit_price !== undefined) line.unit_price = Number(patch.unit_price) || 0;
    }
  }
  if (typeof valid_until === "string" && valid_until) quote.valid_until = valid_until;
  if (typeof terms === "string") quote.terms = terms;
  if (typeof pricing_notes === "string") quote.pricing_notes = pricing_notes;
  recomputeQuoteTotals(quote);
  applyMinPriceGuard(quote, snapshot.products);
  quote.updated_at = new Date().toISOString();
  await writeJson(SNAPSHOT_PATH, snapshot);
  return quote;
}

export async function loadDotenvFiles(files) {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_INQUIRY_CONFIG) paths.push(process.env.KELLY_INQUIRY_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-inquiry", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_INQUIRY_ENV_FILE) paths.push(process.env.KELLY_INQUIRY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-inquiry", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export const SECRET_ENV_KEYS = [
  "access_token_env",
  "phone_number_id_env",
  "ig_user_id_env",
  "page_id_env",
  "token_env",
  "api_key_env"
];

export function summarizeConfig(configResult) {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    quote_defaults: configResult.config.quote_defaults || null,
    follow_up: configResult.config.follow_up || null,
    reply_style: configResult.config.reply_style || null,
    product_kb: configResult.config.product_kb
      ? { source_path: configResult.config.product_kb.source_path || "" }
      : null,
    accounts: accounts.map((account) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => account[key]);
      return {
        account_id: account.account_id || "",
        channel: account.channel || "",
        connector: account.connector || "manual",
        display_name: account.display_name || account.account_id || "",
        handle: account.handle || "",
        secret_envs: secretKeys.map((key) => account[key]),
        secrets_ready: secretKeys.length > 0 && secretKeys.every((key) => Boolean(process.env[account[key]]))
      };
    })
  };
}
