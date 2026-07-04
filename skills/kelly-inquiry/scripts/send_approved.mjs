#!/usr/bin/env node
// Executes APPROVED approval items (replies and quotes). This script is the
// single executor for kelly-inquiry — there is no separate execute_decisions.mjs.
// Dry-run by default; pass --send for real sends.
// Re-checks the agent lock and each item's approval immediately before sending.
// API connectors (whatsapp_cloud / instagram_graph / messenger_graph) send via
// global fetch with tokens referenced by env-var name; email_agent, browser_agent
// and manual connectors become handoff_to_agent operations for the agent.
import fs from "node:fs/promises";
import { EXECUTION_REPORT_PATH, LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  readConfig,
  readLock,
  readSnapshot,
  writeJson,
} from "../app/server/store.mjs";

const send = process.argv.includes("--send");
const API_CONNECTORS = new Set(["whatsapp_cloud", "instagram_graph", "messenger_graph"]);

function nowIso() {
  return new Date().toISOString();
}

function truncate(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const [snapshot, configResult] = await Promise.all([readSnapshot(), readConfig()]);
  const approved = (snapshot.approvals || []).filter((item) => item.status === "approved");

  if (!approved.length) {
    console.log("Send approved: nothing to send. Approve replies or quotes in the app's Approvals view first.");
    return;
  }

  const plans = approved.map((item) => planFor(item, snapshot, configResult.config));

  console.log(`${send ? "SEND" : "DRY-RUN"}: ${approved.length} approved item${approved.length === 1 ? "" : "s"}`);
  for (const plan of plans) {
    console.log(
      `  - ${plan.item.kind === "quote" ? "Quote" : "Reply"} #${plan.item.ref} [${plan.item.channel}] -> ${plan.target || "(no target)"} via ${plan.operation}`,
    );
    console.log(`      "${truncate(plan.item.text)}"`);
    if (plan.blocker) console.log(`      blocker: ${plan.blocker}`);
  }

  if (!send) {
    console.log("Dry-run only. Re-run with --send to execute approved items.");
    return;
  }

  const lock = await readLock();
  if (lock) {
    console.error(`Send refused: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
    process.exitCode = 1;
    return;
  }

  await writeJson(LOCK_PATH, {
    owner: "kelly-inquiry",
    message: "Sending approved replies and quotes",
    started_at: nowIso(),
  });
  const results = [];
  try {
    // Re-read immediately before sending: approvals may have changed.
    const fresh = await readSnapshot();
    for (const plan of plans) {
      const item = (fresh.approvals || []).find((entry) => entry.item_id === plan.item.item_id);
      if (!item || item.status !== "approved") {
        results.push(
          result(plan.item, "skipped", plan.operation, plan.target, "No longer approved at send time.", plan.connector),
        );
        continue;
      }
      if (plan.blocker) {
        item.execution = execution("error", plan.operation, plan.target, plan.blocker);
        results.push(result(item, "error", plan.operation, plan.target, plan.blocker, plan.connector));
        continue;
      }
      if (plan.operation === "handoff_to_agent") {
        item.execution = execution(
          "handoff",
          "handoff_to_agent",
          plan.target,
          `Agent must deliver this ${item.kind} via the ${item.channel} ${plan.connector} flow.`,
        );
        item.updated_at = nowIso();
        results.push(result(item, "handoff", "handoff_to_agent", plan.target, item.execution.detail, plan.connector));
        continue;
      }
      try {
        await sendVia({ ...plan, item });
        item.status = "done";
        item.execution = execution(
          "executed",
          plan.item.kind === "quote" ? "send_quote" : "send_message",
          plan.target,
          `Sent via ${plan.connector}.`,
        );
        item.updated_at = nowIso();
        results.push(
          result(item, "executed", item.execution.operation, plan.target, item.execution.detail, plan.connector),
        );
        console.log(`Sent ${item.kind === "quote" ? "Quote" : "Reply"} #${item.ref} via ${plan.connector}.`);
      } catch (error) {
        item.execution = execution("error", "send_message", plan.target, error.message);
        item.updated_at = nowIso();
        results.push(result(item, "error", "send_message", plan.target, error.message, plan.connector));
        console.error(`${item.kind === "quote" ? "Quote" : "Reply"} #${item.ref} failed: ${error.message}`);
      }
    }
    fresh.generated_at = nowIso();
    await writeJson(SNAPSHOT_PATH, fresh);
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

function planFor(item, snapshot, config) {
  const account = (config.accounts || []).find((entry) => entry.account_id === item.account_id);
  const inquiry = (snapshot.inquiries || []).find((entry) => entry.inquiry_id === item.inquiry_id);
  const connector = account?.connector || "manual";
  const target = inquiry?.provider_conversation_id || "";
  const plan = {
    item,
    account,
    inquiry,
    connector,
    target,
    operation: API_CONNECTORS.has(connector) ? "send_message" : "handoff_to_agent",
    blocker: "",
  };
  if (!account) plan.blocker = `Account ${item.account_id} is not in the config.`;
  else if (API_CONNECTORS.has(connector)) {
    if (!inquiry) plan.blocker = `Inquiry ${item.inquiry_id} is not in the snapshot.`;
    else if (!target) plan.blocker = "Inquiry has no provider_conversation_id target.";
    else {
      const envName = account.access_token_env || account.token_env || "";
      if (!envName || !process.env[envName]) plan.blocker = `Missing token env ${envName || "(none declared)"}.`;
    }
  }
  return plan;
}

async function sendVia(plan) {
  const token = process.env[plan.account.access_token_env || plan.account.token_env];
  const text = plan.item.text;
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
  if (plan.connector === "instagram_graph") {
    const igUserId = process.env[plan.account.ig_user_id_env] || plan.account.ig_user_id || "";
    if (!igUserId) throw new Error("Missing ig_user_id for Instagram Graph send.");
    const recipient = plan.target.replace(/^ig:/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${igUserId}/messages`,
      {
        recipient: { id: recipient },
        message: { text },
      },
      { authorization: `Bearer ${token}` },
    );
    return;
  }
  if (plan.connector === "messenger_graph") {
    const pageId = process.env[plan.account.page_id_env] || plan.account.page_id || "";
    if (!pageId) throw new Error("Missing page_id for Messenger Graph send.");
    const recipient = plan.target.replace(/^fb:/, "");
    await postJson(
      `https://graph.facebook.com/v20.0/${pageId}/messages`,
      {
        recipient: { id: recipient },
        messaging_type: "RESPONSE",
        message: { text },
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

function result(item, status, operation, target, detail, connector = "") {
  return {
    item_id: item.item_id,
    ref: item.ref,
    kind: item.kind,
    inquiry_id: item.inquiry_id,
    status,
    operation,
    connector,
    target,
    detail,
  };
}

await main();
