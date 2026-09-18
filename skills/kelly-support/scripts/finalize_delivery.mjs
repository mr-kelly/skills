#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-support-app/app/js/config.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseArgs(argv) {
  const args = { apply: false, sender: "Kelly Support", sentAt: new Date().toISOString() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--ticket-id") args.ticketId = argv[++index];
    else if (arg === "--provider-message-id") args.providerMessageId = argv[++index];
    else if (arg === "--sent-at") args.sentAt = argv[++index];
    else if (arg === "--sender") args.sender = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

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

function ticketFields(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("__") && !["ref", "messages", "quality_gate"].includes(key)),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/finalize_delivery.mjs --ticket-id <id> --provider-message-id <id> [--sent-at <iso>] [--sender <name>] [--apply]",
    );
    return;
  }
  if (!args.ticketId || !args.providerMessageId) throw new Error("--ticket-id and --provider-message-id are required");
  if (Number.isNaN(new Date(args.sentAt).getTime())) throw new Error("--sent-at must be a valid ISO timestamp");
  if (!process.env.BUSABASE_BASE_URL) throw new Error("BUSABASE_BASE_URL is required");

  const client = createBusabaseClient({
    baseUrl: process.env.BUSABASE_BASE_URL,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
  const resources = await inspectProvisionedResources(client, appConfig);
  const declared = (key) => resources.bases.find((base) => base.key === key);
  const [tickets, messages] = await Promise.all([
    readAll(client, declared("tickets")),
    readAll(client, declared("messages")),
  ]);
  const ticket = tickets.find((row) => row.ticket_id === args.ticketId);
  if (!ticket) throw new Error(`Unknown ticket: ${args.ticketId}`);
  if (ticket.execution_status === "sent") {
    if (ticket.execution_provider_message_id === args.providerMessageId) {
      console.log(`${args.ticketId}: already finalized`);
      return;
    }
    throw new Error("Ticket is already sent with a different provider receipt");
  }
  if (ticket.status !== "approved" || ticket.decision_action !== "approve") throw new Error("Ticket is not approved");
  if (ticket.execution_status !== "queued" && ticket.execution_status !== "sending") {
    throw new Error("Ticket must be queued by execute_decisions.mjs before finalization");
  }
  if (ticket.execution_operation !== "send_reply")
    throw new Error("This finalizer currently accepts send_reply receipts only");

  const digest = createHash("sha256").update(args.providerMessageId).digest("hex").slice(0, 16);
  const messageId = `outgoing-${ticket.ticket_id}-${digest}`;
  const messageExists = messages.some((row) => row.message_id === messageId);
  console.log(
    `${args.apply ? "Finalize" : "Would finalize"} ${ticket.ticket_id}: ${messageId}${messageExists ? " (message exists)" : ""}`,
  );
  if (!args.apply) return;

  if (!messageExists) {
    await client.bases.createChangeRequest({
      baseId: declared("messages").baseId,
      fields: toBusabaseFields({
        message_id: messageId,
        ticket_id: ticket.ticket_id,
        direction: "outgoing",
        sender: args.sender,
        text: ticket.suggested_reply || "",
        sent_at: args.sentAt,
        attachment: "",
      }),
      message: `Record confirmed connector delivery for ${ticket.ticket_id}`,
      submittedBy: "kelly-support-finalizer",
      idempotencyKey: `kelly-support-outgoing:${messageId}`,
      autoMerge: true,
    });
  }

  await client.records.changeRequest({
    recordId: ticket.__recordId,
    operation: "update",
    fields: toBusabaseFields({
      ...ticketFields(ticket),
      status: "done",
      unread: "false",
      sla_first_response_at: ticket.sla_first_response_at || args.sentAt,
      execution_status: "sent",
      execution_provider_message_id: args.providerMessageId,
      execution_completed_at: args.sentAt,
      execution_detail: `Provider accepted delivery: ${args.providerMessageId}`,
      executed_at: args.sentAt,
      updated_at: new Date().toISOString(),
    }),
    message: `Finalize delivered reply for ${ticket.ticket_id}`,
    author: "kelly-support-finalizer",
    baseCommitId: ticket.__headCommitId,
    autoMerge: true,
  });
  console.log(`${ticket.ticket_id}: finalized as sent and done`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
