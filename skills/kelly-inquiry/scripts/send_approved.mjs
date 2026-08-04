#!/usr/bin/env node
// Executes APPROVED approval items (replies and quotes). This script is the
// single executor for kelly-inquiry — there is no separate execute_decisions.mjs.
// Dry-run by default; pass --send for real sends. Re-reads Busabase
// immediately before sending so an item approved (or unapproved) after the
// dry-run plan was built is respected. API connectors (whatsapp_cloud/
// instagram_graph/messenger_graph) send via global fetch — the AirApp
// browser cannot do this (no secrets, no outbound platform calls);
// email_agent/browser_agent/manual connectors become handoff_to_agent
// operations for the agent to deliver (kelly-email drafts, or the user's own
// web session). planFor/sendVia/postJson are ported verbatim from the
// retired scripts/send_approved.ts; only the read/write target changed, from
// app/.data/inquiry_snapshot.json + execution_report.json to Busabase's
// approvals/inquiries/accounts Bases plus a console-printed report (matching
// kelly-messenger's send_outbox.mjs — there is no execution_report Base).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/send_approved.mjs [--send]

Reads approval items with status "approved" from Busabase and prints a send
plan (connector, target, operation) for each. Without --send this is a dry
run. With --send it re-reads Busabase immediately before sending, sends
API-connector items via the official APIs (WhatsApp Cloud, Instagram/
Messenger Graph), marks email_agent/browser_agent/manual items as
handoff_to_agent for the agent to deliver, sets sent items to "done", and
writes the execution result back onto each approval record.`);
}

const API_CONNECTORS = new Set(["whatsapp_cloud", "instagram_graph", "messenger_graph"]);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
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

function truncate(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseApprovalFields(row) {
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
    suggested_by: row.suggested_by || "",
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

function planFor(item, inquiriesById, accountsById) {
  const account = accountsById.get(item.account_id);
  const inquiry = inquiriesById.get(item.inquiry_id);
  const connector = account?.connector || "manual";
  const target = inquiry?.provider_conversation_id || "";
  const plan = {
    item,
    account,
    inquiry,
    connector,
    target,
    operation: API_CONNECTORS.has(connector)
      ? item.kind === "quote"
        ? "send_quote"
        : "send_message"
      : "handoff_to_agent",
    blocker: "",
  };
  if (!account) plan.blocker = `Account ${item.account_id} is not in Busabase.`;
  else if (API_CONNECTORS.has(connector)) {
    if (!inquiry) plan.blocker = `Inquiry ${item.inquiry_id} is not in Busabase.`;
    else if (!target) plan.blocker = "Inquiry has no provider_conversation_id target.";
    else {
      const envName = account.access_token_env || "";
      if (!envName || !process.env[envName]) plan.blocker = `Missing token env ${envName || "(none declared)"}.`;
    }
  }
  return plan;
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      `${url.split("?")[0]} -> HTTP ${res.status}${body.error ? ` (${JSON.stringify(body.error)})` : ""}`,
    );
  return body;
}

async function sendVia(plan) {
  const token = process.env[plan.account.access_token_env];
  const text = plan.item.text;
  if (plan.connector === "whatsapp_cloud") {
    const phoneNumberId = process.env[plan.account.phone_number_id_env] || plan.account.phone_number_id || "";
    if (!phoneNumberId) throw new Error("Missing phone_number_id for WhatsApp Cloud send.");
    const to = plan.target.replace(/@wa$/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  if (plan.connector === "instagram_graph") {
    const igUserId = process.env[plan.account.ig_user_id_env] || "";
    if (!igUserId) throw new Error("Missing ig_user_id for Instagram Graph send.");
    const recipient = plan.target.replace(/^ig:/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${igUserId}/messages`,
      { recipient: { id: recipient }, message: { text } },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  if (plan.connector === "messenger_graph") {
    const pageId = process.env[plan.account.page_id_env] || "";
    if (!pageId) throw new Error("Missing page_id for Messenger Graph send.");
    const recipient = plan.target.replace(/^fb:/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${pageId}/messages`,
      { recipient: { id: recipient }, messaging_type: "RESPONSE", message: { text } },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  throw new Error(`Unsupported connector: ${plan.connector}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const send = args.has("--send");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Inquiry Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [approvalRows, inquiryRows, accountRows] = await Promise.all([
    readAll(client, declared("approvals")),
    readAll(client, declared("inquiries")),
    readAll(client, declared("accounts")),
  ]);
  const inquiriesById = new Map(inquiryRows.map((row) => [row.inquiry_id, row]));
  const accountsById = new Map(accountRows.map((row) => [row.account_id, row]));
  const approved = approvalRows.filter((row) => row.status === "approved");

  if (!approved.length) {
    console.log("Send approved: nothing to send. Approve replies or quotes in the app's Approvals view first.");
    return;
  }

  const plans = approved.map((item) => planFor(item, inquiriesById, accountsById));

  console.log(`${send ? "SEND" : "DRY-RUN"}: ${approved.length} approved item${approved.length === 1 ? "" : "s"}`);
  for (const plan of plans) {
    console.log(
      `  - ${plan.item.kind === "quote" ? "Quote" : "Reply"} ${plan.item.item_id} [${plan.item.channel}] -> ${plan.target || "(no target)"} via ${plan.operation}`,
    );
    console.log(`      "${truncate(plan.item.text)}"`);
    if (plan.blocker) console.log(`      blocker: ${plan.blocker}`);
  }

  if (!send) {
    console.log("Dry-run only. Re-run with --send to execute approved items.");
    return;
  }

  // Re-read immediately before sending: approvals may have changed.
  const freshRows = await readAll(client, declared("approvals"));
  const freshById = new Map(freshRows.map((row) => [row.item_id, row]));
  const nowIso = () => new Date().toISOString();
  const results = [];

  async function writeExecution(fresh, patch, message) {
    await client.records.changeRequest({
      recordId: fresh.__recordId,
      operation: "update",
      fields: toBusabaseFields({ ...baseApprovalFields(fresh), ...patch }),
      message,
      author: "kelly-inquiry-sender",
      baseCommitId: fresh.__headCommitId,
      autoMerge: true,
    });
  }

  for (const plan of plans) {
    const fresh = freshById.get(plan.item.item_id);
    if (!fresh || fresh.status !== "approved") {
      results.push({ item_id: plan.item.item_id, status: "skipped", detail: "No longer approved at send time." });
      continue;
    }
    if (plan.blocker) {
      await writeExecution(
        fresh,
        {
          execution_status: "error",
          execution_operation: plan.operation,
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: plan.blocker,
          executed_at: nowIso(),
        },
        `Send failed for ${plan.item.item_id}`,
      );
      results.push({ item_id: plan.item.item_id, status: "error", detail: plan.blocker });
      continue;
    }
    if (plan.operation === "handoff_to_agent") {
      const detail = `Agent must deliver this ${plan.item.kind} via the ${plan.item.channel} ${plan.connector} flow.`;
      await writeExecution(
        fresh,
        {
          status: "done",
          execution_status: "handoff",
          execution_operation: "handoff_to_agent",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: detail,
          executed_at: nowIso(),
          updated_at: nowIso(),
        },
        `Hand off ${plan.item.item_id} to the agent`,
      );
      results.push({ item_id: plan.item.item_id, status: "handoff", detail });
      continue;
    }
    try {
      await sendVia(plan);
      await writeExecution(
        fresh,
        {
          status: "done",
          execution_status: "executed",
          execution_operation: plan.item.kind === "quote" ? "send_quote" : "send_message",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: `Sent via ${plan.connector}.`,
          executed_at: nowIso(),
          updated_at: nowIso(),
        },
        `Send ${plan.item.item_id}`,
      );
      results.push({ item_id: plan.item.item_id, status: "executed", detail: `Sent via ${plan.connector}.` });
      console.log(`Sent ${plan.item.kind === "quote" ? "Quote" : "Reply"} ${plan.item.item_id} via ${plan.connector}.`);
    } catch (error) {
      await writeExecution(
        fresh,
        {
          execution_status: "error",
          execution_operation: "send_message",
          execution_connector: plan.connector,
          execution_target: plan.target,
          execution_detail: error.message,
          executed_at: nowIso(),
        },
        `Send error for ${plan.item.item_id}`,
      );
      results.push({ item_id: plan.item.item_id, status: "error", detail: error.message });
      console.error(`${plan.item.item_id} failed: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ executed_at: nowIso(), results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
