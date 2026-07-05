#!/usr/bin/env node
// Executes APPROVED outbox replies. Dry-run by default; pass --send for real sends.
// Re-checks the agent lock and each reply's approval immediately before sending.
// API connectors (slack/discord/telegram/whatsapp_cloud) send via global fetch;
// browser_agent and manual connectors become handoff_to_agent operations.
import fs from "node:fs/promises";
import { EXECUTION_REPORT_PATH, LOCK_PATH, OUTBOX_PATH } from "../app/server/paths.ts";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  readConfig,
  readLock,
  readOutbox,
  readSnapshot,
  writeJson,
} from "../app/server/store.ts";

const send = process.argv.includes("--send");
const API_CONNECTORS = new Set(["slack", "discord", "telegram", "whatsapp_cloud"]);

function nowIso() {
  return new Date().toISOString();
}

function truncate(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const [outbox, snapshot, configResult] = await Promise.all([readOutbox(), readSnapshot(), readConfig()]);
  const approved = (outbox.replies || []).filter((reply) => reply.status === "approved");

  if (!approved.length) {
    console.log("Send outbox: no approved replies to send. Approve replies in the app's Outbox view first.");
    return;
  }

  const plans = approved.map((reply) => planFor(reply, snapshot, configResult.config));

  console.log(`${send ? "SEND" : "DRY-RUN"}: ${approved.length} approved repl${approved.length === 1 ? "y" : "ies"}`);
  for (const plan of plans) {
    console.log(
      `  - Reply #${plan.reply.ref} [${plan.reply.platform}] -> ${plan.target || "(no target)"} via ${plan.operation}`,
    );
    console.log(`      "${truncate(plan.reply.text)}"`);
    if (plan.blocker) console.log(`      blocker: ${plan.blocker}`);
  }

  if (!send) {
    console.log("Dry-run only. Re-run with --send to execute approved replies.");
    return;
  }

  const lock = await readLock();
  if (lock) {
    console.error(`Send refused: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
    process.exitCode = 1;
    return;
  }

  await writeJson(LOCK_PATH, {
    owner: "kelly-messenger",
    message: "Sending approved outbox replies",
    started_at: nowIso(),
  });
  const results = [];
  try {
    // Re-read immediately before sending: approvals may have changed.
    const freshOutbox = await readOutbox();
    for (const plan of plans) {
      const reply = (freshOutbox.replies || []).find((item) => item.reply_id === plan.reply.reply_id);
      if (!reply || reply.status !== "approved") {
        results.push(
          result(
            plan.reply,
            "skipped",
            plan.operation,
            plan.target,
            "No longer approved at send time.",
            plan.connector,
          ),
        );
        continue;
      }
      if (plan.blocker) {
        reply.execution = execution("error", plan.operation, plan.target, plan.blocker);
        results.push(result(reply, "error", plan.operation, plan.target, plan.blocker, plan.connector));
        continue;
      }
      if (plan.operation === "handoff_to_agent") {
        reply.execution = execution(
          "handoff",
          "handoff_to_agent",
          plan.target,
          `Agent must deliver this reply via the ${reply.platform} ${plan.connector} flow.`,
        );
        reply.updated_at = nowIso();
        results.push(result(reply, "handoff", "handoff_to_agent", plan.target, reply.execution.detail, plan.connector));
        continue;
      }
      try {
        await sendVia(plan);
        reply.status = "done";
        reply.execution = execution("executed", "send_message", plan.target, `Sent via ${plan.connector}.`);
        reply.updated_at = nowIso();
        results.push(result(reply, "executed", "send_message", plan.target, reply.execution.detail, plan.connector));
        console.log(`Sent Reply #${reply.ref} via ${plan.connector}.`);
      } catch (error) {
        reply.execution = execution("error", "send_message", plan.target, error.message);
        reply.updated_at = nowIso();
        results.push(result(reply, "error", "send_message", plan.target, error.message, plan.connector));
        console.error(`Reply #${reply.ref} failed: ${error.message}`);
      }
    }
    freshOutbox.updated_at = nowIso();
    await writeJson(OUTBOX_PATH, freshOutbox);
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }

  const report = {
    report_id: `exec-${nowIso()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 12)}`,
    mode: "send",
    executed_at: nowIso(),
    results,
  };
  await writeJson(EXECUTION_REPORT_PATH, report);
  console.log(`Wrote ${EXECUTION_REPORT_PATH}`);
}

function planFor(reply, snapshot, config) {
  const account = (config.accounts || []).find((item) => item.account_id === reply.account_id);
  const conversation = (snapshot.conversations || []).find((item) => item.conversation_id === reply.conversation_id);
  const connector = account?.connector || "manual";
  const target = conversation?.provider_conversation_id || "";
  const plan = {
    reply,
    account,
    conversation,
    connector,
    target,
    operation: API_CONNECTORS.has(connector) ? "send_message" : "handoff_to_agent",
    blocker: "",
  };
  if (!account) plan.blocker = `Account ${reply.account_id} is not in the config.`;
  else if (API_CONNECTORS.has(connector)) {
    if (!conversation) plan.blocker = `Conversation ${reply.conversation_id} is not in the snapshot.`;
    else if (!target) plan.blocker = "Conversation has no provider_conversation_id target.";
    else {
      const envName = tokenEnvFor(account);
      if (!envName || !process.env[envName]) plan.blocker = `Missing token env ${envName || "(none declared)"}.`;
    }
  }
  return plan;
}

function tokenEnvFor(account) {
  if (account.connector === "whatsapp_cloud") return account.access_token_env || "";
  return account.bot_token_env || account.user_token_env || account.token_env || "";
}

async function sendVia(plan) {
  const token = process.env[tokenEnvFor(plan.account)];
  const text = plan.reply.text;
  if (plan.connector === "slack") {
    const channel = plan.target.split("/")[0];
    const body = await postJson(
      "https://slack.com/api/chat.postMessage",
      { channel, text },
      { authorization: `Bearer ${token}` },
    );
    if (!body.ok) throw new Error(`Slack chat.postMessage failed: ${body.error}`);
    return;
  }
  if (plan.connector === "discord") {
    const channel = plan.target.replace(/^(chan|dm|thread)\//, "");
    await postJson(
      `https://discord.com/api/v10/channels/${channel}/messages`,
      { content: text },
      { authorization: `Bot ${token}` },
    );
    return;
  }
  if (plan.connector === "telegram") {
    const body = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: plan.target, text });
    if (!body.ok) throw new Error(`Telegram sendMessage failed: ${body.description || "unknown"}`);
    return;
  }
  if (plan.connector === "whatsapp_cloud") {
    const phoneNumberId = process.env[plan.account.phone_number_id_env] || plan.account.phone_number_id || "";
    if (!phoneNumberId) throw new Error("Missing phone_number_id for WhatsApp Cloud send.");
    const to = plan.target.replace(/@wa$/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  throw new Error(`Unsupported connector: ${plan.connector}`);
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

function execution(status, operation, target, detail) {
  return { status, operation, target, detail, executed_at: nowIso() };
}

function result(reply, status, operation, target, detail, connector = "") {
  return {
    reply_id: reply.reply_id,
    ref: reply.ref,
    conversation_id: reply.conversation_id,
    status,
    operation,
    connector,
    target,
    detail,
  };
}

await main();
