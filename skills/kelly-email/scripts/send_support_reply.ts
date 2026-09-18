#!/usr/bin/env node
import { loadConfig, loadDotenv } from "../content/kelly-email-app/lib/common.ts";
import { type SupportReplyRequest, connectorErrorInfo, sendSupportReply } from "./lib/smtp-connector.ts";

function help() {
  console.log(`Usage: printf '<json>' | node scripts/send_support_reply.ts [--apply]

Reads one approved Kelly Support reply request from stdin. The default is a
dry run. --apply performs the SMTP send and prints a sanitized provider receipt.`);
}

async function readStdin() {
  let body = "";
  for await (const chunk of process.stdin) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Support reply request exceeds 1 MB");
  }
  if (!body.trim()) throw new Error("A JSON request is required on stdin");
  return JSON.parse(body) as SupportReplyRequest;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  for (const arg of args) if (arg !== "--apply") throw new Error(`Unknown argument: ${arg}`);
  await loadDotenv();
  const result = await sendSupportReply(await readStdin(), await loadConfig(), { dryRun: !args.has("--apply") });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, ...connectorErrorInfo(error) }));
  process.exitCode = 1;
});
