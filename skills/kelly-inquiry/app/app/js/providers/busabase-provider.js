import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  APPROVAL_ACTIONS,
  applyMinPriceGuard,
  buildConfigSummary,
  buildSnapshot,
  recomputeQuoteTotals,
  statusForAction,
} from "../inquiry-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

export const isStandaloneLocalRuntime = () => {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
};

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

async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function inquiryFields(row) {
  return {
    inquiry_id: row.inquiry_id,
    account_id: row.account_id || "",
    channel: row.channel || "",
    customer_name: row.customer_name || "",
    customer_company: row.customer_company || "",
    customer_country: row.customer_country || "",
    customer_source: row.customer_source || "",
    product_interest: row.product_interest || "",
    product_ids: row.product_ids || "[]",
    quote_ids: row.quote_ids || "[]",
    stage: row.stage || "new",
    value_estimate: row.value_estimate ?? 0,
    currency: row.currency || "USD",
    owner: row.owner || "Kelly",
    unread: row.unread || "false",
    created_at: row.created_at || "",
    next_follow_up: row.next_follow_up || "",
    provider_conversation_id: row.provider_conversation_id || "",
    suggested_reply: row.suggested_reply || "",
    updated_at: row.updated_at || "",
  };
}

function approvalFields(row) {
  return {
    item_id: row.item_id,
    kind: row.kind || "reply",
    inquiry_id: row.inquiry_id || "",
    quote_id: row.quote_id || "",
    account_id: row.account_id || "",
    channel: row.channel || "",
    customer: row.customer || "",
    text: row.text || "",
    note: row.note || "",
    reason: row.reason || "",
    suggested_by: row.suggested_by || "human",
    status: row.status || "needs_review",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_connector: row.execution_connector || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

function quoteFields(row) {
  return {
    quote_id: row.quote_id,
    quote_no: row.quote_no || "",
    inquiry_id: row.inquiry_id || "",
    customer: row.customer || "",
    currency: row.currency || "USD",
    status: row.status || "draft",
    issue_date: row.issue_date || "",
    valid_until: row.valid_until || "",
    items: row.items || "[]",
    subtotal: row.subtotal ?? 0,
    total: row.total ?? 0,
    terms: row.terms || "",
    pricing_notes: row.pricing_notes || "",
    pricing_alerts: row.pricing_alerts || "[]",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [accounts, inquiries, messages, products, quotes, approvals, sync_log, settings] = await Promise.all([
      readAllRecords("accounts"),
      readAllRecords("inquiries"),
      readAllRecords("messages"),
      readAllRecords("products"),
      readAllRecords("quotes"),
      readAllRecords("approvals"),
      readAllRecords("sync_log"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ accounts, inquiries, messages, products, quotes, approvals, sync_log });
    const config_summary = buildConfigSummary({ settings, accounts });
    return {
      app: "kelly-inquiry",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: accounts.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  },

  // Ported from the retired local-file provider (lib/data-provider)'s queueReply(): the
  // inquiry must already exist (from a prior ingest), the draft text is
  // required, and the new approval item is written needs_review.
  async queueReply({ inquiry_id, text, note = "", suggested_by = "human" } = {}) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
    await ensureResources();
    const existing = await findRecord("inquiries", "inquiry-id", inquiry_id);
    if (!existing) throw new Error(`Unknown inquiry: ${inquiry_id}`);
    const inquiry = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const itemId = `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
    const fields = {
      item_id: itemId,
      kind: "reply",
      inquiry_id,
      quote_id: "",
      account_id: inquiry.account_id || "",
      channel: inquiry.channel || "",
      customer: [inquiry.customer_name, inquiry.customer_company].filter(Boolean).join(" · "),
      text: text.trim(),
      note: String(note || ""),
      reason: "Queued from the inquiry composer.",
      suggested_by,
      status: "needs_review",
      created_at: now,
      updated_at: now,
    };
    await upsert("approvals", "item-id", itemId, fields, `Queue reply for ${inquiry_id}`);
    return { ok: true };
  },

  // Human verdict on a queued reply/quote (approve/request_changes/revise/
  // block), written directly onto the approval record. Ported from the
  // retired local-file provider (lib/data-provider)'s decideApproval(): "revise" is a
  // draft-text save that never changes status; the other three verdicts map
  // to a status transition via statusForAction(). A "done" item is terminal
  // (send_approved.mjs already executed it) and cannot be re-decided.
  async decideApproval({ item_id, action, comment = "", text } = {}) {
    if (!APPROVAL_ACTIONS.has(action)) throw new Error(`Unknown action: ${action}`);
    await ensureResources();
    const existing = await findRecord("approvals", "item-id", item_id);
    if (!existing) throw new Error(`Unknown approval item: ${item_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    if (current.status === "done") {
      throw new Error(`Approval item ${item_id} was already executed and cannot be re-decided.`);
    }
    const now = new Date().toISOString();
    const editedText = typeof text === "string" && text.trim() ? text.trim() : "";
    const fields = {
      ...approvalFields(current),
      item_id,
      status: statusForAction(action, current.status || "needs_review"),
      decision_action: action,
      decision_comment: String(comment || ""),
      decided_at: now,
      updated_at: now,
      ...(editedText ? { text: editedText } : {}),
    };
    await upsert("approvals", "item-id", item_id, fields, `Decision on approval ${item_id}: ${action}`);
    return { ok: true };
  },

  // Reschedule an inquiry's next follow-up date (YYYY-MM-DD, or "" to clear it).
  async setFollowUp({ inquiry_id, next_follow_up = "" } = {}) {
    if (next_follow_up && !/^\d{4}-\d{2}-\d{2}$/.test(next_follow_up)) {
      throw new Error("next_follow_up must be YYYY-MM-DD or empty");
    }
    await ensureResources();
    const existing = await findRecord("inquiries", "inquiry-id", inquiry_id);
    if (!existing) throw new Error(`Unknown inquiry: ${inquiry_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const fields = {
      ...inquiryFields(current),
      inquiry_id,
      next_follow_up: next_follow_up || "",
      updated_at: new Date().toISOString(),
    };
    await upsert("inquiries", "inquiry-id", inquiry_id, fields, `Reschedule follow-up for ${inquiry_id}`);
    return { ok: true };
  },

  // Edit draft quote lines/terms; recompute totals and re-run the min-price
  // guard the same way the retired local-file provider (lib/data-provider)'s updateQuote() did.
  async updateQuote({ quote_id, items, valid_until, terms, pricing_notes } = {}) {
    await ensureResources();
    const existing = await findRecord("quotes", "quote-id", quote_id);
    if (!existing) throw new Error(`Unknown quote: ${quote_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    let currentItems;
    try {
      currentItems = JSON.parse(current.items || "[]");
    } catch {
      currentItems = [];
    }
    if (Array.isArray(items)) {
      for (const patch of items) {
        const line = currentItems.find((entry) => entry.line_id === patch.line_id);
        if (!line) continue;
        if (patch.qty !== undefined) line.qty = Number(patch.qty) || 0;
        if (patch.unit_price !== undefined) line.unit_price = Number(patch.unit_price) || 0;
      }
    }
    const quote = { items: currentItems };
    recomputeQuoteTotals(quote);
    const productRows = await readAllRecords("products");
    const products = productRows.map((row) => ({
      product_id: row.product_id,
      sku: row.sku,
      price_min: row.price_min === "" || row.price_min === undefined ? undefined : Number(row.price_min),
    }));
    applyMinPriceGuard(quote, products);
    const fields = {
      ...quoteFields(current),
      quote_id,
      items: JSON.stringify(quote.items),
      subtotal: quote.subtotal,
      total: quote.total,
      pricing_alerts: JSON.stringify(quote.pricing_alerts),
      ...(typeof valid_until === "string" && valid_until ? { valid_until } : {}),
      ...(typeof terms === "string" ? { terms } : {}),
      ...(typeof pricing_notes === "string" ? { pricing_notes } : {}),
      updated_at: new Date().toISOString(),
    };
    await upsert("quotes", "quote-id", quote_id, fields, `Edit quote ${quote_id}`);
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
