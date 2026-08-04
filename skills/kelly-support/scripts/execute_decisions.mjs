#!/usr/bin/env node
// Trusted hand-off step. Kelly Support's AirApp only ever proposes a review
// decision on a ticket (approve / request changes / block); this script is
// the process authorized to act on an `approved` verdict. It performs NO
// external side effect — it never sends an email/WhatsApp/WeChat message,
// never issues a refund, never calls any channel API. Real delivery
// (send_reply / escalate / refund / close) is performed by the configured
// channel connectors (kelly-email drafts, WhatsApp Cloud API, the web-chat
// widget, WeChat Work) by the skill, only after this script's dry-run/--apply
// report, per SKILL.md's boundary — this mirrors the retired
// scripts/execute_decisions.ts exactly: it only ever wrote
// execution_report.json and NEVER flipped a ticket's workflow `status` to
// "done" itself (that remains for the human/agent once the real send is
// confirmed through the channel connector). Re-reads Busabase immediately
// before recording, re-checks the support-qa quality gate and the ticket's
// own decision, refuses any BLOCK, and stays idempotent by checking each
// ticket's own execution-status field (no separate report file — Busabase
// reads are always live).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { buildSnapshot } from "../app/app/js/support-model.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads tickets with status "approved" from Busabase. Without --apply this is a
dry run that only prints what would be handed off. With --apply it re-checks
the support-qa gate and writes an execution marker (execution-status:
"sent"/"blocked"/"skipped", operation, target, etc.) back onto each ticket
that clears every safety gate — it performs no send, no refund, no channel
API call itself, and never changes the ticket's workflow status. Real
sends/escalations/refunds are delegated to the configured channel connectors
by the skill, post-approval, per SKILL.md.`);
}

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

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseTicketFields(row) {
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

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Support Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [accountRows, ticketRows, messageRows, kbRows, settingsRows] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("tickets")),
    readAll(client, declared("messages")),
    readAll(client, declared("knowledge_base")),
    readAll(client, declared("settings")),
  ]);
  const settingsRow = settingsRows.find((row) => row.record_id === "config") || {};
  let risk_policy = {};
  try {
    risk_policy = settingsRow.risk_policy ? JSON.parse(settingsRow.risk_policy) : {};
  } catch {
    risk_policy = {};
  }
  const snapshot = buildSnapshot({
    accounts: accountRows,
    tickets: ticketRows,
    messages: messageRows,
    knowledge_base: kbRows,
    risk_policy,
  });

  const now = new Date().toISOString();
  /** @type {Array<Record<string, any>>} */
  const results = [];

  for (const ticket of snapshot.tickets) {
    // The ticket's own status IS the effective decision (Busabase reads are
    // live) — a decision_action of "approve" only counts while status is
    // still "approved".
    if (ticket.decision?.action !== "approve" || ticket.status !== "approved") continue;

    // Safety gate: never execute a ticket the support-qa audit blocked, even
    // if a stale approve decision exists.
    if (ticket.quality_gate?.verdict === "block") {
      results.push({
        ticket_id: ticket.ticket_id,
        ref: ticket.ref,
        status: "blocked",
        operation: "none",
        reason: "support-qa gate BLOCK; refusing to send (refund/commitment without approval or ungrounded).",
        executed_at: now,
      });
      continue;
    }

    // Idempotent: a ticket already marked "sent" by a prior --apply run is
    // skipped, read live off the ticket record itself (no separate report).
    if (ticket.execution?.status === "sent") {
      results.push({
        ticket_id: ticket.ticket_id,
        ref: ticket.ref,
        status: "skipped",
        operation: "none",
        reason: "Already sent; skipping to stay idempotent.",
        executed_at: now,
      });
      continue;
    }

    const action = ticket.proposed_action || "send_reply";
    /** @type {Record<string, any>} */
    const entry = {
      ticket_id: ticket.ticket_id,
      ref: ticket.ref,
      status: apply ? "sent" : "dry_run",
      operation: action,
      channel: ticket.channel,
      executed_at: now,
    };
    if (action === "send_reply") {
      entry.target = ticket.provider_conversation_id || "";
      entry.draft_id = `reply-${ticket.ticket_id}`;
    } else if (action === "escalate") {
      entry.tier = ticket.execution?.tier || "tier2";
    } else if (action === "refund") {
      entry.amount = Number(ticket.execution?.amount || 0);
    } else if (action === "close") {
      // no extra fields
    } else {
      entry.operation = "no_action";
      entry.status = "skipped";
      entry.reason = "Proposed action is no_action.";
    }
    results.push(entry);

    if (apply) {
      const record = ticketRows.find((row) => row.ticket_id === ticket.ticket_id);
      if (record) {
        await client.records.changeRequest({
          recordId: record.__recordId,
          operation: "update",
          fields: toBusabaseFields({
            ...baseTicketFields(record),
            execution_status: entry.status,
            execution_operation: entry.operation,
            execution_connector: ticket.account_id || "",
            execution_target: entry.target || "",
            execution_tier: entry.tier || "",
            execution_amount: entry.amount ?? "",
            execution_detail: entry.reason || "",
            executed_at: now,
            // Workflow status is deliberately left unchanged — real delivery
            // through the channel connector, not this script, is what
            // ultimately resolves the ticket.
          }),
          message: `Record execution for ticket ${ticket.ticket_id}: ${entry.operation}`,
          author: "kelly-support-executor",
          baseCommitId: record.__headCommitId,
          autoMerge: true,
        });
      }
    }
  }

  if (!results.length) {
    console.log("No approved tickets to execute.");
    return;
  }

  for (const result of results) {
    const extra =
      result.operation === "refund"
        ? ` amount ${result.amount}`
        : result.operation === "escalate"
          ? ` -> ${result.tier}`
          : result.target
            ? ` -> ${result.target}`
            : "";
    console.log(`#${result.ref} ${result.ticket_id}: ${result.status} ${result.operation}${extra}`);
  }

  if (!apply) {
    console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to record execution markers.`);
    return;
  }
  console.log(
    "Recorded execution markers on each ticket. Real sends / escalations / refunds are performed by the channel connectors per SKILL.md.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
