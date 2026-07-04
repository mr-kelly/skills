#!/usr/bin/env node
// Validates app/.data/inquiry_snapshot.json (arg 1) and, when present,
// app/.data/decisions.json (arg 2) against references/inquiry-schema.md.
import fs from "node:fs/promises";

const snapshotTarget = process.argv[2] || new URL("../app/.data/inquiry_snapshot.json", import.meta.url).pathname;
const decisionsTarget = process.argv[3] || new URL("../app/.data/decisions.json", import.meta.url).pathname;
const decisionsExplicit = Boolean(process.argv[3]);

const STAGES = new Set(["new", "replied", "quoted", "negotiating", "won", "lost"]);
const CHANNELS = new Set(["whatsapp", "instagram", "messenger", "email"]);
const CONNECTORS = new Set([
  "whatsapp_cloud",
  "instagram_graph",
  "messenger_graph",
  "email_agent",
  "browser_agent",
  "manual",
]);
const QUOTE_STATUSES = new Set(["draft", "sent", "accepted", "expired", "declined"]);
const APPROVAL_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const APPROVAL_KINDS = new Set(["reply", "quote"]);
const DIRECTIONS = new Set(["incoming", "outgoing"]);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireBoolean(obj, key, path) {
  if (typeof obj[key] !== "boolean") fail(`${path}.${key} must be a boolean`);
}

async function readJsonOrFail(target, label) {
  const raw = await fs.readFile(target, "utf8").catch((error) => {
    fail(`cannot read ${label} ${target}: ${error.message}`);
  });
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${label}: ${error.message}`);
  }
}

const snapshot = await readJsonOrFail(snapshotTarget, "snapshot");

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
requireString(snapshot, "base_currency", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "account_count",
  "inquiry_count",
  "quote_count",
  "product_count",
  "unanswered_new_count",
  "quotes_sent",
  "win_rate",
  "reply_median_minutes",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!isObject(snapshot.metrics.inquiries_this_week)) fail("root.metrics.inquiries_this_week must be an object");
if (!isObject(snapshot.metrics.stage_counts)) fail("root.metrics.stage_counts must be an object");
for (const arrayKey of ["accounts", "inquiries", "quotes", "products", "approvals", "sync_log", "warnings"]) {
  if (!Array.isArray(snapshot[arrayKey])) fail(`root.${arrayKey} must be an array`);
}

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "channel", "connector", "display_name", "status"]) requireString(account, key, path);
  if (!CHANNELS.has(account.channel)) fail(`${path}.channel must be one of ${[...CHANNELS].join("|")}`);
  if (!CONNECTORS.has(account.connector)) fail(`${path}.connector must be one of ${[...CONNECTORS].join("|")}`);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
  for (const key of ["inquiry_count", "unread_count"]) requireNumber(account, key, path);
});

const productIds = new Set();
snapshot.products.forEach((product, index) => {
  const path = `root.products[${index}]`;
  if (!isObject(product)) fail(`${path} must be an object`);
  for (const key of ["product_id", "sku", "name", "currency"]) requireString(product, key, path);
  for (const key of ["moq", "price_min", "price_max", "lead_time_days"]) requireNumber(product, key, path);
  if (product.price_min > product.price_max) fail(`${path}: price_min > price_max`);
  if (!isObject(product.specs)) fail(`${path}.specs must be an object`);
  if (!Array.isArray(product.faq)) fail(`${path}.faq must be an array`);
  product.faq.forEach((entry, fIndex) => {
    if (!isObject(entry)) fail(`${path}.faq[${fIndex}] must be an object`);
    for (const key of ["q", "a"]) requireString(entry, key, `${path}.faq[${fIndex}]`);
  });
  if (productIds.has(product.product_id)) fail(`${path}.product_id duplicates ${product.product_id}`);
  productIds.add(product.product_id);
});

const inquiryIds = new Set();
snapshot.inquiries.forEach((inquiry, index) => {
  const path = `root.inquiries[${index}]`;
  if (!isObject(inquiry)) fail(`${path} must be an object`);
  for (const key of [
    "inquiry_id",
    "account_id",
    "channel",
    "stage",
    "owner",
    "created_at",
    "last_message_at",
    "currency",
  ]) {
    requireString(inquiry, key, path);
  }
  if (!CHANNELS.has(inquiry.channel)) fail(`${path}.channel must be one of ${[...CHANNELS].join("|")}`);
  if (!STAGES.has(inquiry.stage)) fail(`${path}.stage must be one of ${[...STAGES].join("|")}`);
  if (!isObject(inquiry.customer)) fail(`${path}.customer must be an object`);
  requireString(inquiry.customer, "name", `${path}.customer`);
  requireNumber(inquiry, "value_estimate", path);
  requireBoolean(inquiry, "unread", path);
  if (typeof inquiry.next_follow_up !== "string") fail(`${path}.next_follow_up must be a string (may be empty)`);
  if (inquiry.next_follow_up && !/^\d{4}-\d{2}-\d{2}$/.test(inquiry.next_follow_up))
    fail(`${path}.next_follow_up must be YYYY-MM-DD`);
  if (inquiryIds.has(inquiry.inquiry_id)) fail(`${path}.inquiry_id duplicates ${inquiry.inquiry_id}`);
  inquiryIds.add(inquiry.inquiry_id);
  if (!accountIds.has(inquiry.account_id)) fail(`${path}.account_id does not match an account: ${inquiry.account_id}`);
  if (!Array.isArray(inquiry.product_ids)) fail(`${path}.product_ids must be an array`);
  for (const id of inquiry.product_ids) {
    if (!productIds.has(id)) fail(`${path}.product_ids references unknown product: ${id}`);
  }
  if (!Array.isArray(inquiry.quote_ids)) fail(`${path}.quote_ids must be an array`);
  if (!Array.isArray(inquiry.messages) || !inquiry.messages.length) fail(`${path}.messages must be a non-empty array`);
  const messageIds = new Set();
  inquiry.messages.forEach((message, mIndex) => {
    const mPath = `${path}.messages[${mIndex}]`;
    if (!isObject(message)) fail(`${mPath} must be an object`);
    for (const key of ["message_id", "direction", "sender", "sent_at"]) requireString(message, key, mPath);
    if (typeof message.text !== "string") fail(`${mPath}.text must be a string`);
    if (!DIRECTIONS.has(message.direction)) fail(`${mPath}.direction must be incoming|outgoing`);
    if (messageIds.has(message.message_id)) fail(`${mPath}.message_id duplicates ${message.message_id}`);
    messageIds.add(message.message_id);
  });
});

const quoteIds = new Set();
snapshot.quotes.forEach((quote, index) => {
  const path = `root.quotes[${index}]`;
  if (!isObject(quote)) fail(`${path} must be an object`);
  for (const key of [
    "quote_id",
    "quote_no",
    "inquiry_id",
    "customer",
    "currency",
    "status",
    "issue_date",
    "valid_until",
  ]) {
    requireString(quote, key, path);
  }
  if (!QUOTE_STATUSES.has(quote.status)) fail(`${path}.status must be one of ${[...QUOTE_STATUSES].join("|")}`);
  for (const key of ["subtotal", "total"]) requireNumber(quote, key, path);
  if (quoteIds.has(quote.quote_id)) fail(`${path}.quote_id duplicates ${quote.quote_id}`);
  quoteIds.add(quote.quote_id);
  if (!inquiryIds.has(quote.inquiry_id)) fail(`${path}.inquiry_id does not match an inquiry: ${quote.inquiry_id}`);
  if (!Array.isArray(quote.items) || !quote.items.length) fail(`${path}.items must be a non-empty array`);
  const lineIds = new Set();
  quote.items.forEach((line, lIndex) => {
    const lPath = `${path}.items[${lIndex}]`;
    if (!isObject(line)) fail(`${lPath} must be an object`);
    for (const key of ["line_id", "sku", "description"]) requireString(line, key, lPath);
    for (const key of ["qty", "unit_price", "total"]) requireNumber(line, key, lPath);
    if (line.product_id && !productIds.has(line.product_id))
      fail(`${lPath}.product_id references unknown product: ${line.product_id}`);
    if (lineIds.has(line.line_id)) fail(`${lPath}.line_id duplicates ${line.line_id}`);
    lineIds.add(line.line_id);
  });
  if (!Array.isArray(quote.pricing_alerts)) fail(`${path}.pricing_alerts must be an array`);
});

// Cross-check inquiry.quote_ids now that quotes are known.
snapshot.inquiries.forEach((inquiry, index) => {
  for (const id of inquiry.quote_ids) {
    if (!quoteIds.has(id)) fail(`root.inquiries[${index}].quote_ids references unknown quote: ${id}`);
  }
});

const itemIds = new Set();
const refs = new Set();
snapshot.approvals.forEach((item, index) => {
  const path = `root.approvals[${index}]`;
  if (!isObject(item)) fail(`${path} must be an object`);
  for (const key of [
    "item_id",
    "kind",
    "inquiry_id",
    "account_id",
    "channel",
    "customer",
    "text",
    "status",
    "created_at",
  ]) {
    requireString(item, key, path);
  }
  requireNumber(item, "ref", path);
  if (!APPROVAL_KINDS.has(item.kind)) fail(`${path}.kind must be reply|quote`);
  if (!APPROVAL_STATUSES.has(item.status)) fail(`${path}.status must be one of ${[...APPROVAL_STATUSES].join("|")}`);
  if (!inquiryIds.has(item.inquiry_id)) fail(`${path}.inquiry_id does not match an inquiry: ${item.inquiry_id}`);
  if (item.quote_id && !quoteIds.has(item.quote_id))
    fail(`${path}.quote_id references unknown quote: ${item.quote_id}`);
  if (itemIds.has(item.item_id)) fail(`${path}.item_id duplicates ${item.item_id}`);
  itemIds.add(item.item_id);
  if (refs.has(item.ref)) fail(`${path}.ref duplicates #${item.ref}`);
  refs.add(item.ref);
  if (item.decision !== null && item.decision !== undefined) {
    if (!isObject(item.decision)) fail(`${path}.decision must be an object or null`);
    requireString(item.decision, "action", `${path}.decision`);
  }
  if (item.status === "done") {
    if (!isObject(item.execution)) fail(`${path}.execution must be an object when status is done`);
    for (const key of ["status", "operation"]) requireString(item.execution, key, `${path}.execution`);
  }
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["sync_id", "account_id", "method", "at", "status"]) requireString(entry, key, path);
  requireNumber(entry, "new_messages", path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${snapshotTarget}`);

let decisions = null;
try {
  decisions = JSON.parse(await fs.readFile(decisionsTarget, "utf8"));
} catch (error) {
  if (decisionsExplicit || error.code !== "ENOENT") fail(`cannot read decisions ${decisionsTarget}: ${error.message}`);
}

if (decisions) {
  if (!isObject(decisions)) fail("decisions root must be an object");
  requireString(decisions, "schema_version", "decisions");
  if (!isObject(decisions.decisions)) fail("decisions.decisions must be an object keyed by item id");
  for (const [itemId, entry] of Object.entries(decisions.decisions)) {
    const path = `decisions.decisions[${itemId}]`;
    if (!isObject(entry)) fail(`${path} must be an object`);
    requireString(entry, "action", path);
    requireString(entry, "decided_at", path);
    if (entry.status && !APPROVAL_STATUSES.has(entry.status))
      fail(`${path}.status must be one of ${[...APPROVAL_STATUSES].join("|")}`);
  }
  console.log(`OK: ${decisionsTarget}`);
}
