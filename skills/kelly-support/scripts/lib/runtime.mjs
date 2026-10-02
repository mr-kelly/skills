import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../../content/kelly-support-app/app/js/config.js";

export const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

export const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

/** @returns {any} */
export function createTrustedClient() {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  return createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
}

/**
 * @param {any} client
 * @param {any} declared
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function readAll(client, declared) {
  if (!declared?.baseId) throw new Error("Declared Busabase resource is missing");
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
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

/** @param {any} client */
export async function loadSupportWorkspace(client) {
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length || resources.repairs.length) {
    throw new Error("Kelly Support resources are not ready; run setup and merge the required migrations first.");
  }
  const declared = (key) => {
    const resource = resources.bases.find((base) => base.key === key);
    if (!resource) throw new Error(`Missing Kelly Support resource: ${key}`);
    return resource;
  };
  return { resources, declared };
}

/** @param {Record<string, any>} row */
export function ticketFields(row) {
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
    execution_idempotency_key: row.execution_idempotency_key || "",
    execution_provider_message_id: row.execution_provider_message_id || "",
    execution_attempt: row.execution_attempt ?? "",
    execution_started_at: row.execution_started_at || "",
    execution_completed_at: row.execution_completed_at || "",
    execution_last_error: row.execution_last_error || "",
    execution_next_retry_at: row.execution_next_retry_at || "",
    execution_claim_expires_at: row.execution_claim_expires_at || "",
    execution_retryable: row.execution_retryable || "false",
    executed_at: row.executed_at || "",
    updated_at: row.updated_at || "",
  };
}

/**
 * @param {any} client
 * @param {Record<string, any>} row
 * @param {Record<string, any>} patch
 * @param {string} message
 * @param {string} author
 */
export async function updateTicket(client, row, patch, message, author) {
  return client.records.changeRequest({
    recordId: row.__recordId,
    operation: "update",
    fields: toBusabaseFields({ ...ticketFields(row), ...patch }),
    message,
    author,
    baseCommitId: row.__headCommitId,
    autoMerge: true,
  });
}

export const toBool = (value) => value === true || value === "true" || value === 1 || value === "1";

export function due(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function sanitizeExecutionError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/(pass(word)?|auth(orization)?|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 500);
}
