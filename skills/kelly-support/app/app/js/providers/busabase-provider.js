import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  runQualityGate,
  statusForAction,
} from "../support-model.js?v=0.1.0";

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
function ticketFields(row) {
  return {
    ticket_id: row.ticket_id,
    account_id: row.account_id || "",
    channel: row.channel || "",
    customer_name: row.customer_name || "",
    customer_company: row.customer_company || "",
    customer_email: row.customer_email || "",
    customer_handle: row.customer_handle || "",
    customer_country: row.customer_country || "",
    customer_plan: row.customer_plan || "",
    subject: row.subject || "",
    body: row.body || "",
    category: row.category || "how_to",
    priority: row.priority || "normal",
    status: row.status || "needs_review",
    proposed_action: row.proposed_action || "send_reply",
    reason: row.reason || "",
    suggested_reply: row.suggested_reply || "",
    kb_refs: row.kb_refs || "[]",
    sla_policy: row.sla_policy || "first_response",
    sla_due_by: row.sla_due_by || "",
    sla_first_response_at: row.sla_first_response_at || "",
    csat_score: row.csat_score ?? "",
    csat_comment: row.csat_comment || "",
    csat_rated_at: row.csat_rated_at || "",
    owner: row.owner || "Kelly",
    unread: row.unread || "false",
    created_at: row.created_at || "",
    provider_conversation_id: row.provider_conversation_id || "",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_connector: row.execution_connector || "",
    execution_target: row.execution_target || "",
    execution_tier: row.execution_tier || "",
    execution_amount: row.execution_amount ?? "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    updated_at: row.updated_at || "",
  };
}

async function currentRiskAndKb() {
  const [kbRows, settingsRow] = await Promise.all([readAllRecords("knowledge_base"), readSettingsRow()]);
  let risk = {};
  try {
    risk = settingsRow.risk_policy ? JSON.parse(settingsRow.risk_policy) : {};
  } catch {
    risk = {};
  }
  const kb = kbRows.map((row) => ({ article_id: row.article_id, tags: [] }));
  return { kb, risk };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [accounts, tickets, messages, knowledge_base, sync_log, settings] = await Promise.all([
      readAllRecords("accounts"),
      readAllRecords("tickets"),
      readAllRecords("messages"),
      readAllRecords("knowledge_base"),
      readAllRecords("sync_log"),
      readSettingsRow(),
    ]);
    let risk_policy = {};
    try {
      risk_policy = settings.risk_policy ? JSON.parse(settings.risk_policy) : {};
    } catch {
      risk_policy = {};
    }
    const snapshot = buildSnapshot({ accounts, tickets, messages, knowledge_base, sync_log, risk_policy });
    const config_summary = buildConfigSummary({ settings, accounts });
    return {
      app: "kelly-support",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: accounts.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      execution_report: null,
      snapshot,
    };
  },

  // Ported from the retired local-file provider (lib/data-provider)'s
  // queueReply(): the ticket must already exist (from a prior triage/ingest),
  // the draft text is required, and saving a reply always returns the ticket
  // to needs_review (unless already done) and clears any prior decision.
  async saveReply({ ticket_id, text, note = "", kb_refs } = {}) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
    await ensureResources();
    const existing = await findRecord("tickets", "ticket-id", ticket_id);
    if (!existing) throw new Error(`Unknown ticket: ${ticket_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...ticketFields(current),
      ticket_id,
      suggested_reply: text.trim(),
      ...(Array.isArray(kb_refs) ? { kb_refs: JSON.stringify(kb_refs) } : {}),
      ...(note ? { reason: String(note) } : {}),
      status: current.status !== "done" ? "needs_review" : current.status,
      decision_action: "",
      decision_comment: "",
      decided_at: "",
      updated_at: now,
    };
    await upsert("tickets", "ticket-id", ticket_id, fields, `Save reply for ticket ${ticket_id}`);
    return { ok: true };
  },

  // Human verdict on a ticket (approve/request_changes/revise/block), written
  // directly onto the ticket record. Ported from the retired local-file
  // provider (lib/data-provider)'s decideApproval(): "approve" is refused
  // while the (possibly just-edited) reply's support-qa gate is BLOCK —
  // refunds/commitments without approval, or an ungrounded substantive reply.
  async decideApproval({ ticket_id, action, comment = "", text } = {}) {
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unknown action: ${action}`);
    await ensureResources();
    const existing = await findRecord("tickets", "ticket-id", ticket_id);
    if (!existing) throw new Error(`Unknown ticket: ${ticket_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const editedText = typeof text === "string" && text.trim() ? text.trim() : "";

    if (action === "approve") {
      const { kb, risk } = await currentRiskAndKb();
      const candidate = {
        suggested_reply: editedText || current.suggested_reply || "",
        kb_refs: (() => {
          try {
            return JSON.parse(current.kb_refs || "[]");
          } catch {
            return [];
          }
        })(),
        proposed_action: current.proposed_action || "send_reply",
        status: "approved",
        execution: { amount: Number(current.execution_amount || 0) },
      };
      const gate = runQualityGate(candidate, kb, risk);
      if (gate.verdict === "block") {
        const error = new Error(
          "support-qa gate is BLOCK: this reply promises a refund/commitment without approval or is ungrounded. Fix the reply before approving.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    const fields = {
      ...ticketFields(current),
      ticket_id,
      status: statusForAction(action, current.status || "needs_review"),
      decision_action: action,
      decision_comment: String(comment || ""),
      decided_at: now,
      updated_at: now,
      ...(editedText ? { suggested_reply: editedText } : {}),
    };
    await upsert("tickets", "ticket-id", ticket_id, fields, `Decision on ticket ${ticket_id}: ${action}`);
    return { ok: true };
  },

  // Reschedule a ticket's SLA due-by (ISO timestamp, or "" to clear it).
  async saveSla({ ticket_id, due_by = "" } = {}) {
    if (due_by && Number.isNaN(new Date(due_by).getTime())) {
      throw new Error("due_by must be a valid ISO timestamp or empty");
    }
    await ensureResources();
    const existing = await findRecord("tickets", "ticket-id", ticket_id);
    if (!existing) throw new Error(`Unknown ticket: ${ticket_id}`);
    const current = normalizeFields(existing.headCommit?.fields || existing.fields);
    const fields = {
      ...ticketFields(current),
      ticket_id,
      sla_due_by: due_by || "",
      updated_at: new Date().toISOString(),
    };
    await upsert("tickets", "ticket-id", ticket_id, fields, `Reschedule SLA for ticket ${ticket_id}`);
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
