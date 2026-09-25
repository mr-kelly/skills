#!/usr/bin/env node
// Claims approved support work without performing an external side effect.
// Email replies become queued connector work; close/no_action complete locally;
// actions with no configured provider fail closed as blocked.
import { createHash } from "node:crypto";
import { buildSnapshot } from "../content/kelly-support-app/app/js/support-model.js";
import { supportSettingsComplete } from "../content/kelly-support-app/app/js/support-settings.js";
import { createTrustedClient, due, loadSupportWorkspace, readAll, toBool, updateTicket } from "./lib/runtime.mjs";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply] [--retry-failed]

Re-checks approved tickets, support settings, and the support-qa gate. Email
replies are queued for process_email_queue.mjs. close/no_action complete without
an external provider. refund/escalate fail closed until a provider is configured.
--retry-failed requeues only retryable failures whose retry time has arrived.`);
}

function parseArgs(argv) {
  const args = { apply: false, retryFailed: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--retry-failed") args.retryFailed = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function idempotencyKey(ticket) {
  const reviewedVersion = [
    ticket.ticket_id,
    ticket.decision?.decided_at || "",
    ticket.suggested_reply || "",
    ticket.provider_conversation_id || ticket.customer?.email || "",
  ].join("\n");
  return `kelly-support:${ticket.ticket_id}:${createHash("sha256").update(reviewedVersion).digest("hex").slice(0, 24)}`;
}

function connectorFor(ticket, accounts) {
  return accounts.find((account) => account.account_id === ticket.account_id)?.connector || "";
}

function terminalPatch(action, now) {
  return {
    status: "done",
    unread: "false",
    execution_status: action === "no_action" ? "skipped" : "completed",
    execution_operation: action,
    execution_detail: action === "close" ? "Closed after explicit approval." : "No external action required.",
    execution_completed_at: now,
    execution_last_error: "",
    execution_next_retry_at: "",
    execution_claim_expires_at: "",
    execution_retryable: "false",
    executed_at: now,
    updated_at: now,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  const client = createTrustedClient();
  const { declared } = await loadSupportWorkspace(client);
  const [accountRows, ticketRows, messageRows, kbRows, settingsRows] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("tickets")),
    readAll(client, declared("messages")),
    readAll(client, declared("knowledge-base")),
    readAll(client, declared("settings")),
  ]);
  const settingsRow = settingsRows.find((row) => row.record_id === "config") || {};
  if (!supportSettingsComplete(settingsRow)) {
    throw new Error("SUPPORT_SETTINGS_REQUIRED: complete and merge support policy onboarding before execution");
  }
  let riskPolicy = {};
  try {
    riskPolicy = settingsRow.risk_policy ? JSON.parse(settingsRow.risk_policy) : {};
  } catch {
    riskPolicy = {};
  }
  const snapshot = buildSnapshot({
    accounts: accountRows,
    tickets: ticketRows,
    messages: messageRows,
    knowledge_base: kbRows,
    risk_policy: riskPolicy,
  });
  const now = new Date();
  const nowIso = now.toISOString();
  const results = [];

  for (const ticket of snapshot.tickets) {
    if (ticket.decision?.action !== "approve" || ticket.status !== "approved") continue;
    const record = ticketRows.find((row) => row.ticket_id === ticket.ticket_id);
    if (!record) continue;
    const action = ticket.proposed_action || "send_reply";

    if (action === "send_reply" && ticket.quality_gate?.verdict === "block") {
      if (args.apply) {
        await updateTicket(
          client,
          record,
          {
            status: "blocked",
            execution_status: "blocked",
            execution_operation: ticket.proposed_action || "send_reply",
            execution_detail: "support-qa blocked this reviewed version; no external side effect occurred.",
            execution_last_error: "support-qa gate BLOCK",
            execution_retryable: "false",
            execution_completed_at: nowIso,
            updated_at: nowIso,
          },
          `Block unsafe execution for ${ticket.ticket_id}`,
          "kelly-support-executor",
        );
      }
      results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "blocked", operation: "none" });
      continue;
    }

    const executionStatus = ticket.execution?.status || "";
    if (["sent", "completed", "skipped", "blocked"].includes(executionStatus)) {
      results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "skipped", operation: "none" });
      continue;
    }
    if (executionStatus === "sending") {
      if (due(ticket.execution?.claim_expires_at, now.getTime()) && args.apply) {
        await updateTicket(
          client,
          record,
          {
            status: "blocked",
            execution_status: "blocked",
            execution_detail:
              "Connector claim expired after delivery may have started; manual reconciliation required.",
            execution_last_error: "Ambiguous delivery after expired connector claim.",
            execution_retryable: "false",
            execution_completed_at: nowIso,
            updated_at: nowIso,
          },
          `Block ambiguous expired delivery for ${ticket.ticket_id}`,
          "kelly-support-executor",
        );
        results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "blocked", operation: "send_reply" });
      } else {
        results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "skipped", operation: "none" });
      }
      continue;
    }
    if (executionStatus === "queued") {
      results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "skipped", operation: "none" });
      continue;
    }
    if (executionStatus === "failed") {
      if (!args.retryFailed || !toBool(ticket.execution?.retryable) || !due(ticket.execution?.next_retry_at)) {
        results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status: "failed", operation: "send_reply" });
        continue;
      }
    }

    const connector = connectorFor(ticket, accountRows);
    const target = ticket.provider_conversation_id || ticket.customer?.email || "";
    let status = args.apply ? "queued" : "dry_run";
    let detail = "Claimed for connector delivery; no external side effect has occurred yet.";
    let patch = {};

    if (action === "close" || action === "no_action") {
      status = args.apply ? (action === "close" ? "completed" : "skipped") : "dry_run";
      patch = terminalPatch(action, nowIso);
    } else if (action === "refund" || action === "escalate") {
      status = "blocked";
      detail = `${action} has no configured provider; no external side effect occurred.`;
      patch = {
        status: "blocked",
        execution_status: "blocked",
        execution_operation: action,
        execution_connector: connector || ticket.account_id || "",
        execution_target: target,
        execution_detail: detail,
        execution_last_error: detail,
        execution_retryable: "false",
        execution_completed_at: nowIso,
        updated_at: nowIso,
      };
    } else if (action !== "send_reply" || ticket.channel !== "email" || connector !== "email_agent") {
      status = "blocked";
      detail = `No supported connector for ${ticket.channel || "unknown"}/${connector || "unconfigured"}.`;
      patch = {
        status: "blocked",
        execution_status: "blocked",
        execution_operation: action,
        execution_connector: connector || ticket.account_id || "",
        execution_target: target,
        execution_detail: detail,
        execution_last_error: detail,
        execution_retryable: "false",
        execution_completed_at: nowIso,
        updated_at: nowIso,
      };
    } else {
      const stableKey = record.execution_idempotency_key || idempotencyKey(ticket);
      patch = {
        execution_status: "queued",
        execution_operation: "send_reply",
        execution_connector: connector,
        execution_target: target,
        execution_detail: detail,
        execution_idempotency_key: stableKey,
        execution_attempt: Number(record.execution_attempt || 0),
        execution_started_at: "",
        execution_completed_at: "",
        execution_provider_message_id: "",
        execution_last_error: "",
        execution_next_retry_at: "",
        execution_claim_expires_at: "",
        execution_retryable: "false",
        executed_at: "",
        updated_at: nowIso,
      };
    }

    results.push({ ticket_id: ticket.ticket_id, ref: ticket.ref, status, operation: action, target });
    if (args.apply) {
      await updateTicket(
        client,
        record,
        patch,
        `Record execution for ticket ${ticket.ticket_id}: ${action}`,
        "kelly-support-executor",
      );
    }
  }

  if (!results.length) return console.log("No approved tickets to execute.");
  for (const result of results) {
    console.log(`#${result.ref} ${result.ticket_id}: ${result.status} ${result.operation}`);
  }
  if (!args.apply) console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to claim work.`);
  else console.log("Execution decisions recorded. Run process_email_queue.mjs for queued email replies.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
