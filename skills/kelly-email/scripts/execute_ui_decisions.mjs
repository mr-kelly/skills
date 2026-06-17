#!/usr/bin/env node
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import {
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  REPORTS_DIR,
  clearAgentLock,
  loadConfig,
  loadDotenv,
  readJson,
  utcNow,
  writeAgentLock,
  writeJson
} from "../lib/common.mjs";

function parseArgs(argv) {
  const args = { dryRun: false, allowRiskApproved: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-risk-approved") args.allowRiskApproved = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/execute_ui_decisions.mjs [--dry-run] [--allow-risk-approved]

Execute explicit App-in-Skill UI decisions from current_batch.json and decisions.json.
--dry-run performs validation and writes an execution report without touching mailboxes.`);
}

function configuredKeywords(config, riskName) {
  return config.risk_policy?.review_keywords?.[riskName] || [];
}

function hasConfiguredRisk(config, riskName, text) {
  return configuredKeywords(config, riskName).some((keyword) =>
    keyword && text.toLowerCase().includes(String(keyword).toLowerCase())
  );
}

function configuredBlockActions(config) {
  return new Set(config.risk_policy?.block_by_default || ["send_reply"]);
}

function safetyBlockReason(item, action, config) {
  if (action === "send_reply") {
    if (!String(item.draft || "").trim()) return "send_reply requires a non-empty approved draft";
    return null;
  }
  if (!["archive", "mark_read"].includes(action)) return null;
  if (!configuredBlockActions(config).has(action)) return null;

  const text = [item.from, item.subject, item.summary, String(item.body || "").slice(0, 1200)].join("\n").toLowerCase();
  const category = item.category || "";
  const risks = new Set(item.risk || []);

  if (category === "money" || risks.has("money") || hasConfiguredRisk(config, "money", text)) return "configured money cleanup block matched";
  if (category === "course_feedback" || hasConfiguredRisk(config, "course_feedback", text)) return "configured course cleanup block matched";
  if (risks.has("security") || category === "data_privacy_security" || hasConfiguredRisk(config, "security", text)) return "configured security cleanup block matched";
  if (item.attachments?.length || hasConfiguredRisk(config, "attachments", text)) return "configured attachment cleanup block matched";
  return null;
}

function mailboxMap(config) {
  return Object.fromEntries((config.mailboxes || []).map((mailbox) => [mailbox.mailbox_id, mailbox]));
}

function identityMap(config) {
  return Object.fromEntries((config.identities || []).map((identity) => [identity.identity_id, identity]));
}

function parseAddresses(value) {
  const results = [];
  const pattern = /(?:"?([^"<,]*)"?\s*)?<([^<>@\s]+@[^<>\s]+)>|([^<>,\s]+@[^<>,\s]+)/g;
  let match;
  while ((match = pattern.exec(value || ""))) {
    results.push({ name: (match[1] || "").trim(), address: (match[2] || match[3] || "").trim() });
  }
  return results;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveIdentity(item, config) {
  const mailboxes = mailboxMap(config);
  const identities = identityMap(config);
  const recipients = new Set(parseAddresses(item.to || "").map((address) => normalizeEmail(address.address)));

  for (const identity of Object.values(identities)) {
    const sendAs = normalizeEmail(identity.send_as_email);
    const ruleAddresses = new Set((identity.use_when?.recipient_addresses || []).map(normalizeEmail));
    if (recipients.has(sendAs) || [...ruleAddresses].some((address) => recipients.has(address))) {
      const mailbox = mailboxes[identity.mailbox_id];
      if (mailbox) return { identity, mailbox };
    }
  }

  const mailbox = mailboxes[item.account];
  if (!mailbox) throw new Error(`unknown account ${item.account}`);
  const identityId = mailbox.send_identities?.[0];
  if (identityId && identities[identityId]) return { identity: identities[identityId], mailbox };
  throw new Error(`no send identity configured for ${item.account}`);
}

function imapClient(mailbox) {
  const imap = mailbox.imap;
  const password = process.env[imap.password_env];
  if (!password) throw new Error(`Missing environment variable: ${imap.password_env}`);
  return new ImapFlow({
    host: imap.host,
    port: Number(imap.port || 993),
    secure: imap.security === "ssl" || Number(imap.port || 993) === 993,
    auth: { user: imap.username, pass: password },
    logger: false
  });
}

function smtpTransport(mailbox) {
  const smtp = mailbox.smtp;
  const password = process.env[smtp.password_env];
  if (!password) throw new Error(`Missing environment variable: ${smtp.password_env}`);
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 465),
    secure: smtp.security === "ssl" || Number(smtp.port || 465) === 465,
    auth: { user: smtp.username, pass: password }
  });
}

function ensureMsgId(value) {
  const id = String(value || "").trim();
  if (!id) return "";
  if (id.startsWith("<") && id.endsWith(">")) return id;
  return id.includes("@") ? `<${id.replace(/^<|>$/g, "")}>` : id;
}

function replySubject(subject = "") {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject || "(no subject)"}`;
}

function quoteBlock(item) {
  const preview = String(item.quote_preview || item.summary || "").trim();
  if (!preview) return "";
  const lines = preview.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
  return `\n\nOn ${item.date || ""}, ${item.from || "the sender"} wrote:\n${lines.map((line) => `> ${line}`).join("\n")}`;
}

async function executeMailboxGroup(mailbox, entries, dryRun) {
  if (dryRun) return entries.map((entry) => ({ ...entry, status: "dry_run" }));
  const client = imapClient(mailbox);
  await client.connect();
  const results = [];
  try {
    for (const entry of entries) {
      const folder = entry.item.folder || "INBOX";
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
        const uid = Number(entry.item.uid);
        if (entry.action === "archive") {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          await client.messageMove(uid, "Archive", { uid: true });
          results.push({ ...entry, status: "executed" });
        } else if (entry.action === "mark_read") {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          results.push({ ...entry, status: "executed" });
        } else {
          results.push({ ...entry, status: "skipped", skip_reason: `unsupported action ${entry.action}` });
        }
      } catch (error) {
        results.push({ ...entry, status: "error", error: error.message });
      } finally {
        if (lock) lock.release();
      }
    }
    return results;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function sendReply(item, config, dryRun) {
  const { identity, mailbox } = resolveIdentity(item, config);
  if (dryRun) return { item, action: "send_reply", status: "dry_run", identity: identity.identity_id, send_as: identity.send_as_email };
  const [recipient] = parseAddresses(item.from || "");
  if (!recipient?.address) throw new Error("cannot determine reply recipient");
  const threadId = ensureMsgId(item.thread_id);
  const transporter = smtpTransport(mailbox);
  await transporter.sendMail({
    from: { name: identity.display_name || identity.send_as_email, address: identity.send_as_email },
    to: recipient.name ? { name: recipient.name, address: recipient.address } : recipient.address,
    replyTo: identity.reply_to || undefined,
    subject: replySubject(item.subject),
    text: `${String(item.draft || "").trim()}${quoteBlock(item)}`,
    inReplyTo: threadId || undefined,
    references: threadId || undefined
  });
  return { item, action: "send_reply", status: "executed", identity: identity.identity_id, send_as: identity.send_as_email };
}

function compactResult(result) {
  const item = result.item || {};
  return {
    uid: item.uid,
    account: item.account,
    from: item.from,
    subject: item.subject,
    category: item.category,
    action: result.action,
    status: result.status,
    identity: result.identity,
    send_as: result.send_as,
    skip_reason: result.skip_reason,
    error: result.error
  };
}

async function writeReport(batch, results, blocked, dryRun, allowRiskApproved) {
  const summary = {};
  for (const result of results) summary[result.status] = (summary[result.status] || 0) + 1;
  if (blocked.length) summary.blocked = blocked.length;
  const report = {
    batch_id: batch.batch_id,
    executed_at: utcNow(),
    dry_run: dryRun,
    allow_risk_approved: allowRiskApproved,
    summary,
    results: results.map(compactResult),
    blocked: blocked.map(compactResult)
  };
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const path = `${REPORTS_DIR}/${batch.batch_id}-${stamp}.json`;
  await writeJson(path, report);
  return path;
}

async function updateBatchAfterExecution(batch, results, blocked) {
  const byId = new Map((batch.items || []).map((item) => [String(item.id), item]));
  for (const result of results) {
    if (result.status !== "executed") continue;
    const item = byId.get(String(result.item?.id));
    if (!item) continue;
    item.execution = {
      status: "executed",
      action: result.action,
      executed_at: utcNow(),
      identity: result.identity,
      send_as: result.send_as
    };
    item.status = "executed";
  }
  for (const result of blocked) {
    const item = byId.get(String(result.item?.id));
    if (!item) continue;
    item.execution = {
      status: "blocked",
      action: result.action,
      reason: result.skip_reason,
      checked_at: utcNow()
    };
    item.status = "needs_review";
    item.proposed_action = "review";
  }
  await writeJson(CURRENT_BATCH_PATH, batch);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  await loadDotenv();
  const config = await loadConfig();
  const mailboxes = mailboxMap(config);
  const batch = await readJson(CURRENT_BATCH_PATH);
  const decisionsPayload = await readJson(DECISIONS_PATH);
  if (decisionsPayload.batch_id !== batch.batch_id) throw new Error("decisions.json batch_id does not match current_batch.json");

  const items = new Map((batch.items || []).map((item) => [String(item.id), item]));
  const groups = new Map();
  const sendEntries = [];
  const blocked = [];

  for (const decisionRow of decisionsPayload.decisions || []) {
    const action = decisionRow.decision?.action;
    if (!["archive", "mark_read", "send_reply"].includes(action)) continue;
    const item = items.get(String(decisionRow.id));
    if (!item) {
      blocked.push({ item: { uid: decisionRow.uid, subject: decisionRow.subject }, action, status: "blocked", skip_reason: "item missing from batch" });
      continue;
    }
    if (decisionRow.edited_draft !== undefined) item.draft = decisionRow.edited_draft;
    if (decisionRow.decision?.comment !== undefined) item.user_comment = decisionRow.decision.comment;
    if (item.status === "executed" || item.execution?.status === "executed") continue;
    const reason = safetyBlockReason(item, action, config);
    if (reason) {
      if (args.allowRiskApproved && ["archive", "mark_read"].includes(action)) {
        item.execution_override = { reason, approved_by_user: true, approved_at: utcNow() };
      } else {
        blocked.push({ item, action, status: "blocked", skip_reason: reason });
        continue;
      }
    }
    if (action === "send_reply") {
      sendEntries.push({ item, action });
      continue;
    }
    const mailbox = mailboxes[item.account];
    if (!mailbox) {
      blocked.push({ item, action, status: "blocked", skip_reason: `unknown account ${item.account}` });
      continue;
    }
    if (!groups.has(item.account)) groups.set(item.account, []);
    groups.get(item.account).push({ item, action });
  }

  const results = [];
  for (const [account, entries] of groups.entries()) {
    results.push(...(await executeMailboxGroup(mailboxes[account], entries, args.dryRun)));
  }
  for (const entry of sendEntries) {
    try {
      results.push(await sendReply(entry.item, config, args.dryRun));
    } catch (error) {
      results.push({ ...entry, status: "error", error: error.message });
    }
  }

  if (!args.dryRun) await updateBatchAfterExecution(batch, results, blocked);
  const reportPath = await writeReport(batch, results, blocked, args.dryRun, args.allowRiskApproved);
  console.log(JSON.stringify({
    batch_id: batch.batch_id,
    dry_run: args.dryRun,
    allow_risk_approved: args.allowRiskApproved,
    executed: results.filter((result) => result.status === "executed").length,
    dry_run_count: results.filter((result) => result.status === "dry_run").length,
    errors: results.filter((result) => result.status === "error").length,
    blocked: blocked.length,
    report_path: reportPath
  }, null, 2));
  return 0;
}

await writeAgentLock("/kelly-email is executing approved decisions.");
try {
  process.exitCode = await main();
} finally {
  await clearAgentLock();
}
