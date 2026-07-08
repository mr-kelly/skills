#!/usr/bin/env node
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  APP_CACHE_DIR,
  ATTACHMENTS_DIR,
  CLASSIFICATION_PIPELINE_VERSION,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  SCAN_STATE_PATH,
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
  writeJson,
} from "../lib/common.ts";
import type { Config, Mailbox, ReviewItem } from "../lib/types.ts";

interface BatchArgs {
  reviewQuota: number;
  maxScanPerMailbox: number;
  dryRun: boolean;
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
    else if (arg === "--review-quota") args.reviewQuota = Number(argv[++i]);
    else if (arg === "--max-scan-per-mailbox") args.maxScanPerMailbox = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/generate_review_batch.ts [--review-quota 5] [--max-scan-per-mailbox 120] [--dry-run]

Read unread IMAP mail, generate the local App-in-Skill review batch, and reset decisions.json.
--dry-run reads and classifies mail but does not write current_batch.json or decisions.json.`);
}

function mailboxFolders(mailbox: Mailbox) {
  const folders = mailbox.support_folders_or_labels?.length ? [...mailbox.support_folders_or_labels] : ["INBOX"];
  if (!folders.some((folder) => folder.toUpperCase() === "INBOX")) folders.push("INBOX");
  return folders;
}

function imapClient(mailbox: Mailbox) {
  const imap = mailbox.imap;
  if (!imap?.host || !imap.username || !imap.password_env)
    throw new Error(`missing IMAP config for ${mailbox.mailbox_id}`);
  const password = process.env[imap.password_env];
  if (!password) throw new Error(`Missing environment variable: ${imap.password_env}`);
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

async function folderUnseenUids(client: any) {
  const uids = await client.search({ seen: false }, { uid: true });
  return [...uids].sort((a, b) => Number(b) - Number(a));
}

async function fetchMailbox(
  mailbox: Mailbox,
  reviewQuota: number,
  maxScan: number,
  config: Config,
): Promise<ReviewItem[]> {
  const client = imapClient(mailbox);
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
        const uids = await folderUnseenUids(client);
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
          if (classification.status === "needs_review") needsReview += 1;
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
            category: classification.category,
            risk: classification.risk,
            status: classification.status,
            proposed_action: classification.proposed_action,
            classification_method: "rule_prefilter",
            classification_pipeline_version: CLASSIFICATION_PIPELINE_VERSION,
            rule_prefilter: rulePrefilter,
            agent_review: {
              status: "pending",
              confidence: "low",
              evidence: "Waiting for kelly-email agent semantic review.",
              changed: false,
            },
            reason: classification.reason,
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

  await writeJson(CURRENT_BATCH_PATH, batch);
  await writeJson(DECISIONS_PATH, { batch_id: batch.batch_id, updated_at: utcNow(), decisions: [] });
  await writeJson(SCAN_STATE_PATH, {
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
  });
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
  const onboarding = onboardingStatus(config, configMeta);
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

  for (const mailbox of config.mailboxes || []) {
    const remainingReviewQuota = args.reviewQuota - allItems.filter((item) => item.status === "needs_review").length;
    if (remainingReviewQuota <= 0) break;
    allItems.push(...(await fetchMailbox(mailbox, remainingReviewQuota, args.maxScanPerMailbox, config)));
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
          cache_dir: APP_CACHE_DIR,
          attachments_dir: ATTACHMENTS_DIR,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const batch = await writeBatch(allItems);
  console.log(
    JSON.stringify(
      {
        batch_id: batch.batch_id,
        items: allItems.length,
        prepared: batch.metrics.prepared,
        needs_review: batch.metrics.needs_review,
        batch_path: CURRENT_BATCH_PATH,
      },
      null,
      2,
    ),
  );
  return 0;
}

await writeAgentLock("/kelly-email is generating a new mail review batch.");
try {
  process.exitCode = await main();
} finally {
  await clearAgentLock();
}
