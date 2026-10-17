#!/usr/bin/env node
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  CLASSIFICATION_PIPELINE_VERSION,
  SKILL_DIR,
  classify,
  cleanText,
  clearAgentLock,
  clearBatchAttachments,
  ensureDirs,
  htmlToText,
  loadConfigWithMeta,
  loadDotenv,
  onboardingStatus,
  persistAttachments,
  reviewRecommendationFor,
  sanitizeHtmlEmail,
  shortQuote,
  stableItemId,
  summaryFrom,
  utcNow,
  writeAgentLock,
} from "../content/kelly-email-app/lib/common.ts";
import { createProvider } from "../content/kelly-email-app/lib/data-provider/index.ts";
import type { Config, Mailbox, ReviewItem } from "../content/kelly-email-app/lib/types.ts";
import { enforceRecipientScopedReview } from "./lib/support-intake.ts";

interface BatchArgs {
  reviewQuota: number;
  maxScanPerMailbox: number;
  dryRun: boolean;
  mailboxId?: string;
  recipient?: string;
  help?: boolean;
}

interface ParsedAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  cid?: string;
  content?: Buffer;
}

function parseArgs(argv: string[]): BatchArgs {
  const args: BatchArgs = { reviewQuota: 5, maxScanPerMailbox: 120, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--mailbox") {
      args.mailboxId = String(argv[++i] || "").trim();
      if (!args.mailboxId) throw new Error("--mailbox requires a mailbox id");
    } else if (arg === "--recipient") {
      args.recipient = String(argv[++i] || "").trim();
      if (!args.recipient) throw new Error("--recipient requires an email address");
    } else if (arg === "--review-quota") args.reviewQuota = Number(argv[++i]);
    else if (arg === "--max-scan-per-mailbox") args.maxScanPerMailbox = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/generate_review_batch.ts [--mailbox <mailbox-id>] [--recipient <email>] [--review-quota 5] [--max-scan-per-mailbox 120] [--dry-run]

Read unread IMAP mail and generate structured Busabase review/contact records.
--mailbox restricts secret checks and scanning to one configured physical mailbox.
--recipient adds an IMAP server-side To-header filter before any message body is downloaded.
--dry-run reads and classifies mail but does not write Busabase records.`);
}

function mailboxFolders(mailbox: Mailbox) {
  const folders = mailbox.support_folders_or_labels?.length ? [...mailbox.support_folders_or_labels] : ["INBOX"];
  if (!folders.some((folder) => folder.toUpperCase() === "INBOX")) folders.push("INBOX");
  return folders;
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
    auth: {
      user: imap.username,
      pass: password,
    },
    logger: false,
  });
}

function addressText(addressObject: any) {
  return addressObject?.text || "";
}

function extractBody(parsed: any) {
  const html = typeof parsed.html === "string" ? sanitizeHtmlEmail(parsed.html) : "";
  const text = parsed.text || (html ? htmlToText(html) : "");
  return {
    body: cleanText(text),
    html,
  };
}

function normalizedAttachments(parsed: any) {
  return (parsed.attachments || []).map((attachment: ParsedAttachment) => ({
    filename: attachment.filename || "",
    contentType: attachment.contentType || "application/octet-stream",
    size: attachment.size || attachment.content?.length || 0,
    contentId: attachment.contentId || attachment.cid || "",
    content: attachment.content || Buffer.alloc(0),
  }));
}

function stableDedupeKey(mailbox: Mailbox, parsed: any, sender: string, subject: string, body: string) {
  const messageId = (parsed.messageId || "").trim();
  const surveyMatch = String(body || "").match(/Survey ID:\s*([A-Za-z0-9_-]+)/i);
  if (surveyMatch) return `survey:${surveyMatch[1]}`;
  return messageId || `${mailbox.mailbox_group_id || mailbox.mailbox_id}:${sender}:${subject}`;
}

async function fetchOne(client: any, uid: unknown) {
  return client.fetchOne(
    uid,
    { uid: true, source: true, flags: true, envelope: true, internalDate: true },
    { uid: true },
  );
}

async function folderUnseenUids(client: any, recipient = "") {
  const query = recipient ? { seen: false, header: { to: recipient } } : { seen: false };
  const uids = await client.search(query, { uid: true });
  return [...uids].sort((a, b) => Number(b) - Number(a));
}

async function fetchMailbox(
  mailbox: Mailbox,
  reviewQuota: number,
  maxScan: number,
  config: Config,
  recipient = "",
): Promise<ReviewItem[]> {
  const client = await imapClient(mailbox);
  await client.connect();
  const items: ReviewItem[] = [];
  const seenKeys = new Set<string>();
  let needsReview = 0;
  let scanned = 0;

  try {
    for (const folder of mailboxFolders(mailbox)) {
      let lock: { release: () => void } | undefined;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        continue;
      }
      try {
        const uids = await folderUnseenUids(client, recipient);
        for (const uid of uids) {
          if (scanned >= maxScan || needsReview >= reviewQuota) break;
          const message = await fetchOne(client, uid);
          if (!message?.source) continue;
          scanned += 1;

          const parsed = await simpleParser(message.source);
          const subject = parsed.subject || "(no subject)";
          const sender = addressText(parsed.from);
          const to = addressText(parsed.to);
          const cc = addressText(parsed.cc);
          const messageId = (parsed.messageId || "").trim();
          const { body, html } = extractBody(parsed);
          const attachments = normalizedAttachments(parsed);
          const dedupeKey = stableDedupeKey(mailbox, parsed, sender, subject, body);
          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);

          const classification = classify(sender, subject, body, attachments, config);
          const reviewBrief = reviewRecommendationFor(classification, sender, subject, body, attachments, config);
          const effectiveClassification = enforceRecipientScopedReview(classification, recipient);
          if (effectiveClassification.status === "needs_review") needsReview += 1;
          const itemId = stableItemId(mailbox.mailbox_id || "", String(uid), messageId, subject);
          const rulePrefilter = {
            category: classification.category,
            risk: classification.risk,
            status: classification.status,
            proposed_action: classification.proposed_action,
            reason: classification.reason,
          };

          items.push({
            id: itemId,
            uid: String(uid),
            thread_id: messageId || String(uid),
            message_id: messageId,
            account: mailbox.mailbox_id,
            mailbox_group_id: mailbox.mailbox_group_id || "",
            folder,
            from: sender,
            to,
            cc,
            date: parsed.date ? parsed.date.toISOString() : message.internalDate?.toISOString?.() || "",
            subject,
            category: effectiveClassification.category,
            risk: effectiveClassification.risk,
            status: effectiveClassification.status,
            proposed_action: effectiveClassification.proposed_action,
            classification_method: "rule_prefilter",
            classification_pipeline_version: CLASSIFICATION_PIPELINE_VERSION,
            rule_prefilter: rulePrefilter,
            agent_review: {
              status: "pending",
              confidence: "low",
              evidence: "Waiting for kelly-email agent semantic review.",
              changed: false,
            },
            reason: effectiveClassification.reason,
            review_brief: reviewBrief,
            suggested_reply: reviewBrief.suggested_reply || "",
            summary: summaryFrom(subject, body),
            body,
            html,
            has_html: Boolean(html),
            quote_preview: shortQuote(body),
            attachments,
            draft: "",
            decision: {},
            execution: {},
            execution_override: {},
            user_comment: "",
          });
        }
      } finally {
        lock.release();
      }
      if (scanned >= maxScan || needsReview >= reviewQuota) break;
    }
    return items;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function writeBatch(items: ReviewItem[]) {
  await ensureDirs();
  const batchId = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 15)
    .replace(/^(\d{8})(\d{6}).*/, "kelly-email-$1-$2");
  await clearBatchAttachments(batchId);
  await ensureDirs();

  for (const item of items) {
    const persisted = await persistAttachments(batchId, item.id, item.html || "", item.attachments || []);
    item.html = persisted.html;
    item.has_html = Boolean(item.html);
    item.attachments = persisted.attachments;
  }

  const batch = {
    batch_id: batchId,
    generated_at: utcNow(),
    source: "kelly-email-skill",
    mode: "app-in-skill",
    classification_pipeline: {
      version: CLASSIFICATION_PIPELINE_VERSION,
      stage: "rule_prefilter",
      requires_agent_review: true,
      note: "Node.js generator performs read-only IMAP parsing and conservative rule prefiltering. The Kelly Email agent must run semantic review before presenting actions as final.",
    },
    items,
    metrics: {
      scanned: items.length,
      prepared: items.filter((item) => item.status === "prepared").length,
      needs_review: items.filter((item) => item.status === "needs_review").length,
      drafted: items.filter((item) => item.status === "drafted").length,
    },
  };

  const provider = createProvider();
  await provider.saveBatch(batch);
  await provider.writeDecisions(batch);
  const scanState = {
    last_generated_batch_id: batch.batch_id,
    last_generated_at: batch.generated_at,
    items: items.map((item) => ({
      uid: item.uid,
      account: item.account,
      subject: (item.subject || "").slice(0, 160),
      from: (item.from || "").slice(0, 160),
      category: item.category,
      proposed_action: item.proposed_action,
    })),
  };
  if (!provider.writeScanState) throw new Error("Busabase provider does not support scan state.");
  await provider.writeScanState(scanState);
  return batch;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  await loadDotenv();
  const configMeta = await loadConfigWithMeta();
  const config = configMeta.config;
  const mailboxes = args.mailboxId
    ? (config.mailboxes || []).filter((mailbox) => mailbox.mailbox_id === args.mailboxId)
    : config.mailboxes || [];
  if (args.mailboxId && mailboxes.length === 0) throw new Error(`Unknown mailbox: ${args.mailboxId}`);
  const selectedConfig = { ...config, mailboxes };
  const onboarding = onboardingStatus(selectedConfig, configMeta);
  if (!onboarding.configured) {
    console.log(
      JSON.stringify(
        {
          onboarding_required: true,
          state: onboarding.state,
          message: onboarding.message,
          recommended_config: onboarding.recommended_config,
          recommended_env: onboarding.recommended_env,
          example_config: onboarding.example_config,
          legacy_source: onboarding.legacy_source,
          missing_env: onboarding.missing_env,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const allItems: ReviewItem[] = [];

  for (const mailbox of mailboxes) {
    const remainingReviewQuota = args.reviewQuota - allItems.filter((item) => item.status === "needs_review").length;
    if (remainingReviewQuota <= 0) break;
    allItems.push(
      ...(await fetchMailbox(mailbox, remainingReviewQuota, args.maxScanPerMailbox, selectedConfig, args.recipient)),
    );
  }
  allItems.sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          items: allItems.length,
          prepared: allItems.filter((item) => item.status === "prepared").length,
          needs_review: allItems.filter((item) => item.status === "needs_review").length,
          skill_dir: SKILL_DIR,
          batch_path: "busabase:base/kelly-email-reviews-v3",
          attachments_path: "busabase:drive/kelly-email-files-v3/attachments/<batch_id>/...",
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const batch = await writeBatch(allItems);
  const provider = createProvider();
  console.log(
    JSON.stringify(
      {
        batch_id: batch.batch_id,
        items: allItems.length,
        prepared: batch.metrics.prepared,
        needs_review: batch.metrics.needs_review,
        batch_path: "busabase:base/kelly-email-reviews-v3",
      },
      null,
      2,
    ),
  );
  return 0;
}

const helpOnly = process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h");
if (helpOnly) {
  process.exitCode = await main();
} else {
  await writeAgentLock("/kelly-email is generating a new mail review batch.");
  try {
    process.exitCode = await main();
  } finally {
    await clearAgentLock();
  }
}
