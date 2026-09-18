#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supportSettingsComplete } from "../content/kelly-support-app/app/js/support-settings.js";
import { finalizeDelivery } from "./finalize_delivery.mjs";
import {
  createTrustedClient,
  loadSupportWorkspace,
  readAll,
  sanitizeExecutionError,
  updateTicket,
} from "./lib/runtime.mjs";

const skillRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/process_email_queue.mjs [--ticket-id <id>] [--apply] [--max-attempts <n>]

Consumes queued email send_reply work through Kelly Email. The default is a dry
run. --apply claims each ticket, sends once, and finalizes only with a provider
receipt. Failed explicit 4xx responses can be requeued by execute_decisions.mjs
--retry-failed; ambiguous network outcomes are blocked for manual reconciliation.`);
}

function parseArgs(argv) {
  const args = { apply: false, maxAttempts: 3, retryDelaySeconds: undefined, limit: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--ticket-id") args.ticketId = String(argv[++index] || "").trim();
    else if (arg === "--max-attempts") args.maxAttempts = Number(argv[++index]);
    else if (arg === "--retry-delay-seconds") args.retryDelaySeconds = Number(argv[++index]);
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.maxAttempts) || args.maxAttempts < 1) throw new Error("--max-attempts must be >= 1");
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) throw new Error("--limit must be 1-100");
  if (
    args.retryDelaySeconds !== undefined &&
    (!Number.isFinite(args.retryDelaySeconds) || args.retryDelaySeconds < 0)
  ) {
    throw new Error("--retry-delay-seconds must be >= 0");
  }
  return args;
}

function connectorPath() {
  if (process.env.KELLY_EMAIL_CONNECTOR_PATH) return path.resolve(process.env.KELLY_EMAIL_CONNECTOR_PATH);
  return path.resolve(skillRoot, "..", "kelly-email", "scripts", "send_support_reply.ts");
}

async function runConnector(request, apply) {
  const child = spawn(process.execPath, [connectorPath(), ...(apply ? ["--apply"] : [])], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(JSON.stringify(request));
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, 60_000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timer);
  if (timedOut) {
    const error = new Error("Kelly Email connector timed out; delivery outcome is ambiguous.");
    Object.assign(error, { code: "CONNECTOR_TIMEOUT", ambiguous: true, retryable: false });
    throw error;
  }
  let result;
  try {
    result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}");
  } catch {
    throw new Error(
      `Kelly Email connector returned invalid JSON${stderr ? `: ${sanitizeExecutionError(stderr)}` : ""}`,
    );
  }
  if (exitCode !== 0 || result.ok !== true) {
    const error = new Error(result.message || stderr || "Kelly Email connector failed");
    Object.assign(error, result);
    throw error;
  }
  return result;
}

const latestIncoming = (messages, ticketId) =>
  messages
    .filter((message) => message.ticket_id === ticketId && message.direction === "incoming")
    .sort((a, b) => Date.parse(b.sent_at || "") - Date.parse(a.sent_at || ""))[0];

async function currentTicket(client, declared, ticketId) {
  return (await readAll(client, declared("tickets"))).find((ticket) => ticket.ticket_id === ticketId);
}

async function recordFailure(client, declared, ticketId, error, maxAttempts, retryDelaySeconds) {
  const ticket = await currentTicket(client, declared, ticketId);
  if (!ticket) throw new Error(`Ticket disappeared while recording failure: ${ticketId}`);
  const attempt = Number(ticket.execution_attempt || 1);
  const ambiguous = error.ambiguous === true;
  const retryable = error.retryable === true && !ambiguous && attempt < maxAttempts;
  const delaySeconds = retryDelaySeconds ?? Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1));
  const nextRetryAt = retryable ? new Date(Date.now() + delaySeconds * 1000).toISOString() : "";
  const message = sanitizeExecutionError(error);
  await updateTicket(
    client,
    ticket,
    {
      status: retryable ? "approved" : "blocked",
      execution_status: retryable ? "failed" : "blocked",
      execution_detail: ambiguous
        ? "Ambiguous SMTP outcome; manual reconciliation required before any retry."
        : retryable
          ? `Temporary SMTP rejection; retry after ${nextRetryAt}.`
          : "SMTP delivery failed and requires human review.",
      execution_last_error: message,
      execution_next_retry_at: nextRetryAt,
      execution_claim_expires_at: "",
      execution_retryable: String(retryable),
      execution_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    `Record email connector failure for ${ticketId}`,
    "kelly-support-email-worker",
  );
  return { retryable, ambiguous, nextRetryAt, message };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  const client = createTrustedClient();
  const { declared } = await loadSupportWorkspace(client);
  const [tickets, accounts, messages, settings] = await Promise.all([
    readAll(client, declared("tickets")),
    readAll(client, declared("accounts")),
    readAll(client, declared("messages")),
    readAll(client, declared("settings")),
  ]);
  const settingsRow = settings.find((row) => row.record_id === "config") || {};
  if (!supportSettingsComplete(settingsRow)) throw new Error("SUPPORT_SETTINGS_REQUIRED");
  const queued = tickets
    .filter(
      (ticket) =>
        ticket.status === "approved" &&
        ticket.decision_action === "approve" &&
        ticket.execution_status === "queued" &&
        ticket.execution_operation === "send_reply" &&
        (!args.ticketId || ticket.ticket_id === args.ticketId),
    )
    .slice(0, args.limit);
  if (!queued.length) return console.log("No queued email replies to process.");

  for (const snapshotTicket of queued) {
    const ticket = args.apply ? await currentTicket(client, declared, snapshotTicket.ticket_id) : snapshotTicket;
    if (!ticket || ticket.execution_status !== "queued" || ticket.status !== "approved") {
      console.log(`${snapshotTicket.ticket_id}: skipped stale queue entry`);
      continue;
    }
    const account = accounts.find((candidate) => candidate.account_id === ticket.account_id);
    const incoming = latestIncoming(messages, ticket.ticket_id);
    const request = {
      idempotencyKey: ticket.execution_idempotency_key,
      fromAddress: account?.handle || "",
      toAddress: ticket.customer_email || ticket.execution_target || ticket.provider_conversation_id || "",
      customerName: ticket.customer_name || "",
      subject: ticket.subject || "",
      text: ticket.suggested_reply || "",
      inReplyTo: incoming?.provider_message_id || "",
      references: incoming?.provider_references || "",
    };

    if (!args.apply) {
      const result = await runConnector(request, false);
      console.log(
        `${ticket.ticket_id}: dry_run ${result.sendAs} -> ${request.toAddress}${result.threaded ? " threaded" : " unthreaded"}`,
      );
      continue;
    }

    const startedAt = new Date();
    await updateTicket(
      client,
      ticket,
      {
        execution_status: "sending",
        execution_attempt: Number(ticket.execution_attempt || 0) + 1,
        execution_started_at: startedAt.toISOString(),
        execution_claim_expires_at: new Date(startedAt.getTime() + 10 * 60 * 1000).toISOString(),
        execution_detail: "Kelly Email SMTP connector owns this delivery attempt.",
        execution_last_error: "",
        execution_retryable: "false",
        updated_at: startedAt.toISOString(),
      },
      `Claim email delivery for ${ticket.ticket_id}`,
      "kelly-support-email-worker",
    );

    try {
      const result = await runConnector(request, true);
      await finalizeDelivery({
        client,
        ticketId: ticket.ticket_id,
        providerReceiptId: result.providerReceiptId,
        submittedMessageId: result.submittedMessageId || result.messageId,
        sentAt: new Date().toISOString(),
        sender: result.sendAs,
        references: request.inReplyTo || request.references,
        apply: true,
      });
      console.log(
        `${ticket.ticket_id}: sent ${result.submittedMessageId || result.messageId} receipt=${result.providerReceiptId}${result.threaded ? " threaded" : " unthreaded"}`,
      );
    } catch (error) {
      const failure = await recordFailure(
        client,
        declared,
        ticket.ticket_id,
        /** @type {any} */ (error),
        args.maxAttempts,
        args.retryDelaySeconds,
      );
      console.log(
        `${ticket.ticket_id}: ${failure.retryable ? "failed_retryable" : "blocked"}${failure.nextRetryAt ? ` retry_at=${failure.nextRetryAt}` : ""}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
