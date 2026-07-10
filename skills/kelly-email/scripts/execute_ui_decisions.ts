#!/usr/bin/env node
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { clearAgentLock, loadConfig, loadDotenv, utcNow, writeAgentLock } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import type { Batch, Config, DecisionsPayload, Mailbox, ReviewItem } from "../lib/types.ts";

interface ExecEntry {
  item: ReviewItem;
  action: string;
  target_folder?: string;
  identity?: string;
  send_as?: string;
  [key: string]: unknown;
}

interface ExecResult extends Record<string, unknown> {
  item?: ReviewItem | { uid?: string; subject?: string };
  action?: string;
  status?: string;
  mailbox_operation?: string;
  target_folder?: string;
  mark_read?: boolean;
  identity?: string;
  send_as?: string;
  skip_reason?: string;
  error?: string;
}

interface ExecArgs {
  dryRun: boolean;
  allowRiskApproved: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ExecArgs {
  const args: ExecArgs = { dryRun: false, allowRiskApproved: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-risk-approved") args.allowRiskApproved = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/execute_ui_decisions.ts [--dry-run] [--allow-risk-approved]

Execute explicit App-in-Skill UI decisions from current_batch.json and decisions.json.
--dry-run validates actions and writes an execution report without touching mailboxes.`);
}

function configuredKeywords(config: Config, riskName: string): string[] {
  return config.risk_policy?.review_keywords?.[riskName] || [];
}

function hasConfiguredRisk(config: Config, riskName: string, text: string) {
  return configuredKeywords(config, riskName).some(
    (keyword) => keyword && text.toLowerCase().includes(String(keyword).toLowerCase()),
  );
}

function configuredBlockActions(config: Config) {
  return new Set(config.risk_policy?.block_by_default || ["send_reply"]);
}

function safetyBlockReason(item: ReviewItem, action: string, config: Config) {
  if (action === "send_reply") {
    if (!String(item.draft || "").trim()) return "send_reply requires a non-empty approved draft";
    return null;
  }
  if (!["archive", "mark_read"].includes(action)) return null;
  if (!configuredBlockActions(config).has(action)) return null;

  const text = [item.from, item.subject, item.summary, String(item.body || "").slice(0, 1200)].join("\n").toLowerCase();
  const category = item.category || "";
  const risks = new Set(item.risk || []);

  if (category === "money" || risks.has("money") || hasConfiguredRisk(config, "money", text))
    return "configured money cleanup block matched";
  if (category === "course_feedback" || hasConfiguredRisk(config, "course_feedback", text))
    return "configured course cleanup block matched";
  if (risks.has("security") || category === "data_privacy_security" || hasConfiguredRisk(config, "security", text))
    return "configured security cleanup block matched";
  if (item.attachments?.length || hasConfiguredRisk(config, "attachments", text))
    return "configured attachment cleanup block matched";
  return null;
}

function mailboxMap(config: Config): Record<string, Mailbox> {
  return Object.fromEntries((config.mailboxes || []).map((mailbox) => [mailbox.mailbox_id, mailbox]));
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function riskTarget(routing: Record<string, any>, item: ReviewItem) {
  const byRisk = asObject(routing.by_risk);
  for (const risk of item.risk || []) {
    const target = firstString(byRisk[risk]);
    if (target) return target;
  }
  return "";
}

function archiveTargetFolder(config: Config, mailbox: Mailbox, item: ReviewItem) {
  const globalRouting = asObject(config.archive_routing);
  const mailboxRouting = asObject(mailbox.archive_routing);
  const byCategory = {
    ...asObject(globalRouting.by_category),
    ...asObject(mailboxRouting.by_category),
  };
  return firstString(
    item.target_folder,
    item.archive_folder,
    item.execution?.target_folder,
    item.execution_override?.target_folder,
    byCategory[item.category || ""],
    riskTarget(mailboxRouting, item),
    riskTarget(globalRouting, item),
    mailboxRouting.default_folder,
    mailbox.archive_folder,
    globalRouting.default_folder,
  );
}

function identityMap(config: Config): Record<string, any> {
  return Object.fromEntries((config.identities || []).map((identity) => [identity.identity_id, identity]));
}

function parseAddresses(value: string) {
  const results: Array<{ name: string; address: string }> = [];
  const pattern = /(?:"?([^"<,]*)"?\s*)?<([^<>@\s]+@[^<>\s]+)>|([^<>,\s]+@[^<>,\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value || ""))) {
    results.push({ name: (match[1] || "").trim(), address: (match[2] || match[3] || "").trim() });
  }
  return results;
}

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveIdentity(item: ReviewItem, config: Config) {
  const mailboxes = mailboxMap(config);
  const identities = identityMap(config);
  const recipients = new Set(parseAddresses(item.to || "").map((address) => normalizeEmail(address.address)));

  for (const identity of Object.values(identities)) {
    const sendAs = normalizeEmail(identity.send_as_email);
    const ruleAddresses = new Set<string>(
      (identity.use_when?.recipient_addresses || []).map((value: unknown) => normalizeEmail(value)),
    );
    if (recipients.has(sendAs) || [...ruleAddresses].some((address) => recipients.has(address))) {
      const mailbox = mailboxes[identity.mailbox_id];
      if (mailbox) return { identity, mailbox };
    }
  }

  const mailbox = mailboxes[item.account || ""];
  if (!mailbox) throw new Error(`unknown account ${item.account}`);
  const identityId = mailbox.send_identities?.[0];
  if (identityId && identities[identityId]) return { identity: identities[identityId], mailbox };
  throw new Error(`no send identity configured for ${item.account}`);
}

function endpointSecretRef(endpoint: unknown) {
  const data = endpoint && typeof endpoint === "object" ? (endpoint as Record<string, unknown>) : {};
  return String(data.vault_ref || data.password_vault_ref || data.secret_ref || data.password_env || "").trim();
}

async function endpointPassword(endpoint: unknown, label: string) {
  const ref = endpointSecretRef(endpoint);
  if (!ref) throw new Error(`missing secret reference for ${label}`);
  const provider = createProvider();
  if (provider.getSecret) {
    const secret = await provider.getSecret(ref);
    if (!secret) throw new Error(`Missing Busabase Vault secret: ${ref}`);
    return secret;
  }
  const secret = process.env[ref];
  if (!secret) throw new Error(`Missing environment variable: ${ref}`);
  return secret;
}

async function imapClient(mailbox: Mailbox) {
  const imap = mailbox.imap;
  if (!imap?.host || !imap.username) throw new Error(`missing IMAP config for ${mailbox.mailbox_id}`);
  const password = await endpointPassword(imap, `${mailbox.mailbox_id}:imap`);
  return new ImapFlow({
    host: imap.host,
    port: Number(imap.port || 993),
    secure: imap.security === "ssl" || Number(imap.port || 993) === 993,
    auth: { user: imap.username, pass: password },
    logger: false,
  });
}

async function smtpTransport(mailbox: Mailbox) {
  const smtp = mailbox.smtp;
  if (!smtp?.host || !smtp.username) throw new Error(`missing SMTP config for ${mailbox.mailbox_id}`);
  const password = await endpointPassword(smtp, `${mailbox.mailbox_id}:smtp`);
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 465),
    secure: smtp.security === "ssl" || Number(smtp.port || 465) === 465,
    auth: { user: smtp.username, pass: password },
  });
}

function ensureMsgId(value: unknown) {
  const id = String(value || "").trim();
  if (!id) return "";
  if (id.startsWith("<") && id.endsWith(">")) return id;
  return id.includes("@") ? `<${id.replace(/^<|>$/g, "")}>` : id;
}

function replySubject(subject = "") {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject || "(no subject)"}`;
}

function quoteBlock(item: ReviewItem) {
  const preview = String(item.quote_preview || item.summary || "").trim();
  if (!preview) return "";
  const lines = preview
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  return `\n\nOn ${item.date || ""}, ${item.from || "the sender"} wrote:\n${lines.map((line) => `> ${line}`).join("\n")}`;
}

function executionPlan(entry: ExecEntry): ExecResult {
  const base = {
    ...entry,
    mark_read: ["archive", "mark_read", "send_reply"].includes(entry.action),
  };
  if (entry.action === "archive")
    return { ...base, mailbox_operation: "move_to_folder", target_folder: entry.target_folder };
  if (entry.action === "mark_read") return { ...base, mailbox_operation: "mark_read" };
  if (entry.action === "send_reply") return { ...base, mailbox_operation: "send_reply" };
  return base;
}

async function executeMailboxGroup(mailbox: Mailbox, entries: ExecEntry[], dryRun: boolean): Promise<ExecResult[]> {
  if (dryRun) return entries.map((entry) => ({ ...executionPlan(entry), status: "dry_run" }));
  const client = await imapClient(mailbox);
  await client.connect();
  const results: ExecResult[] = [];
  try {
    for (const entry of entries) {
      const folder = entry.item.folder || "INBOX";
      let lock: { release: () => void } | undefined;
      try {
        lock = await client.getMailboxLock(folder);
        const uid = Number(entry.item.uid);
        if (entry.action === "archive") {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          await client.messageMove(uid, entry.target_folder, { uid: true });
          results.push({ ...executionPlan(entry), status: "executed" });
        } else if (entry.action === "mark_read") {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          results.push({ ...executionPlan(entry), status: "executed" });
        } else {
          results.push({
            ...executionPlan(entry),
            status: "skipped",
            skip_reason: `unsupported action ${entry.action}`,
          });
        }
      } catch (error) {
        results.push({
          ...executionPlan(entry),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (lock) lock.release();
      }
    }
    return results;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function sendReply(item: ReviewItem, config: Config, dryRun: boolean): Promise<ExecResult> {
  const { identity, mailbox } = resolveIdentity(item, config);
  const plan: ExecEntry = {
    item,
    action: "send_reply",
    identity: identity.identity_id,
    send_as: identity.send_as_email,
  };
  if (dryRun) return { ...executionPlan(plan), status: "dry_run" };
  const [recipient] = parseAddresses(item.from || "");
  if (!recipient?.address) throw new Error("cannot determine reply recipient");
  const threadId = ensureMsgId(item.thread_id);
  const transporter = await smtpTransport(mailbox);
  await transporter.sendMail({
    from: { name: identity.display_name || identity.send_as_email, address: identity.send_as_email },
    to: recipient.name ? { name: recipient.name, address: recipient.address } : recipient.address,
    replyTo: identity.reply_to || undefined,
    subject: replySubject(item.subject),
    text: `${String(item.draft || "").trim()}${quoteBlock(item)}`,
    inReplyTo: threadId || undefined,
    references: threadId || undefined,
  });
  return { ...executionPlan(plan), status: "executed" };
}

function compactResult(result: ExecResult) {
  const item = (result.item || {}) as ReviewItem;
  return {
    uid: item.uid,
    account: item.account,
    from: item.from,
    subject: item.subject,
    category: item.category,
    action: result.action,
    status: result.status,
    mailbox_operation: result.mailbox_operation,
    target_folder: result.target_folder,
    mark_read: result.mark_read,
    identity: result.identity,
    send_as: result.send_as,
    skip_reason: result.skip_reason,
    error: result.error,
  };
}

async function writeReport(
  batch: Batch,
  results: ExecResult[],
  blocked: ExecResult[],
  dryRun: boolean,
  allowRiskApproved: boolean,
) {
  const summary: Record<string, number> = {};
  for (const result of results) {
    const status = result.status || "unknown";
    summary[status] = (summary[status] || 0) + 1;
  }
  if (blocked.length) summary.blocked = blocked.length;
  const report = {
    batch_id: batch.batch_id,
    executed_at: utcNow(),
    dry_run: dryRun,
    allow_risk_approved: allowRiskApproved,
    connector: { status: "bundled", type: "imap-smtp" },
    summary,
    results: results.map(compactResult),
    blocked: blocked.map(compactResult),
  };
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const provider = createProvider();
  const result = provider.writeExecutionReport
    ? await provider.writeExecutionReport(batch, report, stamp)
    : { path: `${batch.batch_id}-${stamp}.json`, skipped: true };
  return String(result.path || result.record_id || JSON.stringify(result));
}

async function updateBatchAfterExecution(batch: Batch, results: ExecResult[], blocked: ExecResult[]) {
  const byId = new Map((batch.items || []).map((item) => [String(item.id), item]));
  for (const result of results) {
    const item = byId.get(String((result.item as ReviewItem)?.id));
    if (!item) continue;
    if (result.status === "executed") {
      item.execution = {
        status: "executed",
        action: result.action,
        mailbox_operation: result.mailbox_operation,
        target_folder: result.target_folder,
        mark_read: result.mark_read,
        executed_at: utcNow(),
        identity: result.identity,
        send_as: result.send_as,
      };
      item.status = "executed";
    } else if (result.status === "dry_run") {
      item.execution = {
        status: "dry_run",
        action: result.action,
        mailbox_operation: result.mailbox_operation,
        target_folder: result.target_folder,
        mark_read: result.mark_read,
        checked_at: utcNow(),
        identity: result.identity,
        send_as: result.send_as,
      };
    }
  }
  for (const result of blocked) {
    const item = byId.get(String((result.item as ReviewItem)?.id));
    if (!item) continue;
    item.execution = {
      status: "blocked",
      action: result.action,
      mailbox_operation: result.mailbox_operation,
      target_folder: result.target_folder,
      mark_read: result.mark_read,
      reason: result.skip_reason,
      checked_at: utcNow(),
    };
    item.status = "needs_review";
    item.proposed_action = "review";
  }
  await createProvider().saveBatch(batch);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  await loadDotenv();
  const provider = createProvider();
  const config = (await loadConfig()) as Config;
  const mailboxes = mailboxMap(config);
  const batch = (await provider.getBatch()) as Batch;
  const decisionsPayload = (await provider.getDecisions()) as DecisionsPayload;
  if (decisionsPayload.batch_id !== batch.batch_id)
    throw new Error("decisions.json batch_id does not match current_batch.json");

  const items = new Map<string, ReviewItem>((batch.items || []).map((item) => [String(item.id), item]));
  const groups = new Map<string, ExecEntry[]>();
  const sendEntries: ExecEntry[] = [];
  const blocked: ExecResult[] = [];

  for (const decisionRow of decisionsPayload.decisions || []) {
    const action = String(decisionRow.decision?.action || "");
    if (!["archive", "mark_read", "send_reply"].includes(action)) continue;
    const item = items.get(String(decisionRow.id));
    if (!item) {
      blocked.push({
        item: { uid: decisionRow.uid, subject: decisionRow.subject },
        action,
        status: "blocked",
        skip_reason: "item missing from batch",
      });
      continue;
    }
    if (decisionRow.edited_draft !== undefined) item.draft = decisionRow.edited_draft;
    if (decisionRow.decision?.comment !== undefined) item.user_comment = decisionRow.decision.comment;
    if (item.status === "executed" || item.execution?.status === "executed") continue;

    const reason = safetyBlockReason(item, action, config);
    if (reason && !(args.allowRiskApproved && ["archive", "mark_read"].includes(action))) {
      blocked.push({ item, action, status: "blocked", skip_reason: reason });
      continue;
    }
    if (reason) item.execution_override = { reason, approved_by_user: true, approved_at: utcNow() };

    const mailbox = mailboxes[item.account || ""];
    if (!mailbox) {
      blocked.push({ item, action, status: "blocked", skip_reason: `unknown account ${item.account}` });
      continue;
    }

    if (action === "send_reply") {
      sendEntries.push({ item, action });
      continue;
    }

    let entry: ExecEntry = { item, action };
    if (action === "archive") {
      const targetFolder = archiveTargetFolder(config, mailbox, item);
      if (!targetFolder) {
        blocked.push({
          item,
          action,
          status: "blocked",
          mailbox_operation: "move_to_folder",
          mark_read: true,
          skip_reason: `archive requires a target folder for account ${item.account}; configure archive_routing.default_folder or archive_routing.by_category.${item.category || "other"}`,
        });
        continue;
      }
      entry = { ...entry, target_folder: targetFolder };
    }

    const account = item.account || "";
    if (!groups.has(account)) groups.set(account, []);
    groups.get(account)?.push(entry);
  }

  const results: ExecResult[] = [];
  for (const [account, entries] of groups.entries()) {
    results.push(...(await executeMailboxGroup(mailboxes[account], entries, args.dryRun)));
  }
  for (const entry of sendEntries) {
    try {
      results.push(await sendReply(entry.item, config, args.dryRun));
    } catch (error) {
      results.push({
        ...executionPlan(entry),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!args.dryRun) await updateBatchAfterExecution(batch, results, blocked);
  const reportPath = await writeReport(batch, results, blocked, args.dryRun, args.allowRiskApproved);
  console.log(
    JSON.stringify(
      {
        batch_id: batch.batch_id,
        dry_run: args.dryRun,
        allow_risk_approved: args.allowRiskApproved,
        executed: results.filter((result) => result.status === "executed").length,
        dry_run_count: results.filter((result) => result.status === "dry_run").length,
        errors: results.filter((result) => result.status === "error").length,
        blocked: blocked.length,
        connector_status: "bundled",
        report_path: reportPath,
      },
      null,
      2,
    ),
  );
  return 0;
}

await writeAgentLock("/kelly-email is executing approved decisions.");
try {
  process.exitCode = await main();
} finally {
  await clearAgentLock();
}
