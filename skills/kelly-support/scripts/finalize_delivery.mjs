#!/usr/bin/env node
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createTrustedClient, loadSupportWorkspace, readAll, toBusabaseFields, updateTicket } from "./lib/runtime.mjs";

function parseArgs(argv) {
  const args = { apply: false, sender: "Kelly Support", sentAt: new Date().toISOString(), references: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--ticket-id") args.ticketId = argv[++index];
    else if (arg === "--provider-receipt-id") args.providerReceiptId = argv[++index];
    else if (arg === "--submitted-message-id") args.submittedMessageId = argv[++index];
    else if (arg === "--provider-message-id") args.legacyProviderMessageId = argv[++index];
    else if (arg === "--sent-at") args.sentAt = argv[++index];
    else if (arg === "--sender") args.sender = argv[++index];
    else if (arg === "--references") args.references = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * @param {{client?: any, ticketId?: string, providerReceiptId?: string, submittedMessageId?: string, providerMessageId?: string, sentAt?: string, sender?: string, references?: string, apply?: boolean}} options
 */
export async function finalizeDelivery({
  client = createTrustedClient(),
  ticketId,
  providerReceiptId,
  submittedMessageId,
  providerMessageId,
  sentAt = new Date().toISOString(),
  sender = "Kelly Support",
  references = "",
  apply = false,
} = {}) {
  const receiptId = String(providerReceiptId || providerMessageId || "").trim();
  const rfcMessageId = String(submittedMessageId || providerMessageId || "").trim();
  if (!ticketId || !receiptId || !rfcMessageId) {
    throw new Error("ticketId, providerReceiptId, and submittedMessageId are required");
  }
  if (Number.isNaN(new Date(sentAt).getTime())) throw new Error("sentAt must be a valid ISO timestamp");
  const { declared } = await loadSupportWorkspace(client);
  const [tickets, messages] = await Promise.all([
    readAll(client, declared("tickets")),
    readAll(client, declared("messages")),
  ]);
  const ticket = tickets.find((row) => row.ticket_id === ticketId);
  if (!ticket) throw new Error(`Unknown ticket: ${ticketId}`);
  if (ticket.execution_status === "sent") {
    if (ticket.execution_provider_message_id === receiptId) {
      return { status: "already_finalized", ticketId, providerReceiptId: receiptId, submittedMessageId: rfcMessageId };
    }
    throw new Error("Ticket is already sent with a different provider receipt");
  }
  if (ticket.status !== "approved" || ticket.decision_action !== "approve") throw new Error("Ticket is not approved");
  if (!["queued", "sending"].includes(ticket.execution_status)) {
    throw new Error("Ticket must be queued by execute_decisions.mjs before finalization");
  }
  if (ticket.execution_operation !== "send_reply") throw new Error("This finalizer accepts send_reply receipts only");

  const digest = createHash("sha256").update(receiptId).digest("hex").slice(0, 16);
  const messageId = `outgoing-${ticket.ticket_id}-${digest}`;
  const messageExists = messages.some((row) => row.message_id === messageId);
  if (!apply) {
    return {
      status: "dry_run",
      ticketId,
      providerReceiptId: receiptId,
      submittedMessageId: rfcMessageId,
      messageId,
      messageExists,
    };
  }

  if (!messageExists) {
    await client.bases.createChangeRequest({
      baseId: declared("messages").baseId,
      fields: toBusabaseFields({
        message_id: messageId,
        ticket_id: ticket.ticket_id,
        direction: "outgoing",
        sender,
        text: ticket.suggested_reply || "",
        sent_at: sentAt,
        attachment: "",
        provider_message_id: rfcMessageId,
        provider_references: references,
      }),
      message: `Record confirmed connector delivery for ${ticket.ticket_id}`,
      submittedBy: "kelly-support-finalizer",
      idempotencyKey: `kelly-support-outgoing:${messageId}`,
      autoMerge: true,
    });
  }

  await updateTicket(
    client,
    ticket,
    {
      status: "done",
      unread: "false",
      sla_first_response_at: ticket.sla_first_response_at || sentAt,
      execution_status: "sent",
      execution_provider_message_id: receiptId,
      execution_completed_at: sentAt,
      execution_detail: `Provider accepted delivery: ${receiptId}; submitted Message-ID: ${rfcMessageId}`,
      execution_last_error: "",
      execution_next_retry_at: "",
      execution_claim_expires_at: "",
      execution_retryable: "false",
      executed_at: sentAt,
      updated_at: new Date().toISOString(),
    },
    `Finalize delivered reply for ${ticket.ticket_id}`,
    "kelly-support-finalizer",
  );
  return {
    status: "finalized",
    ticketId,
    providerReceiptId: receiptId,
    submittedMessageId: rfcMessageId,
    messageId,
    messageExists,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/finalize_delivery.mjs --ticket-id <id> --provider-receipt-id <smtp-2xx> --submitted-message-id <rfc-id> [--sent-at <iso>] [--sender <name>] [--references <ids>] [--apply]",
    );
    return;
  }
  const result = await finalizeDelivery({
    ticketId: args.ticketId,
    providerReceiptId: args.providerReceiptId,
    submittedMessageId: args.submittedMessageId,
    providerMessageId: args.legacyProviderMessageId,
    sentAt: args.sentAt,
    sender: args.sender,
    references: args.references,
    apply: args.apply,
  });
  if (result.status === "already_finalized") console.log(`${result.ticketId}: already finalized`);
  else if (result.status === "dry_run")
    console.log(
      `Would finalize ${result.ticketId}: ${result.messageId}${result.messageExists ? " (message exists)" : ""}`,
    );
  else console.log(`${result.ticketId}: finalized as sent and done`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
