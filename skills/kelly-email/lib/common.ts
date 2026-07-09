import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
  configFileCandidates,
  createProvider,
  envFileCandidates,
  loadConfig,
  loadConfigWithMeta,
  loadDotenv,
  onboardingStatus,
  privateConfigCandidates,
} from "./data-provider/index.ts";
import {
  APP_DIR,
  ATTACHMENTS_DIR,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  LOCK_PATH,
  REPORTS_DIR,
  ROOT_DIR,
  SCAN_STATE_PATH,
  SKILL_CACHE_DIR,
  SKILL_DIR,
} from "./paths.ts";
import type { Attachment, Brand, Config, ReviewItem } from "./types.ts";

export const SCRIPTS_DIR = join(SKILL_DIR, "scripts");
export const ROOT = ROOT_DIR;
export const APP_DATA_DIR = join(APP_DIR, ".data");
export const APP_CACHE_DIR = APP_DATA_DIR; // back-compat alias
export {
  ATTACHMENTS_DIR,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  LOCK_PATH,
  REPORTS_DIR,
  SCAN_STATE_PATH,
  SKILL_CACHE_DIR,
  SKILL_DIR,
};

export const CLASSIFICATION_PIPELINE_VERSION = "2026-06-16-app-in-skill-v2-node";

export {
  configFileCandidates,
  envFileCandidates,
  loadConfig,
  loadConfigWithMeta,
  loadDotenv,
  onboardingStatus,
  privateConfigCandidates,
};

export function utcNow() {
  return new Date().toISOString();
}

export async function ensureDirs() {
  if (createProvider().kind === "busabase") return;
  await mkdir(APP_CACHE_DIR, { recursive: true });
  await mkdir(SKILL_CACHE_DIR, { recursive: true });
}

export async function writeAgentLock(message) {
  await createProvider().writeLock(message);
}

export async function clearAgentLock() {
  await createProvider().clearLock();
}

export async function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${path}`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export function configuredEmailAccounts(config: Config, source = "") {
  const identitiesByMailbox = new Map();
  for (const identity of config.identities || []) {
    const rows = identitiesByMailbox.get(identity.mailbox_id) || [];
    rows.push({
      identity_id: identity.identity_id || "",
      send_as_email: identity.send_as_email || "",
      display_name: identity.display_name || "",
      brand_or_product: identity.brand_or_product || "",
      reply_to: identity.reply_to || "",
    });
    identitiesByMailbox.set(identity.mailbox_id, rows);
  }
  return {
    source,
    accounts: (config.mailboxes || []).map((mailbox) => {
      const imapRef =
        mailbox.imap?.vault_ref || mailbox.imap?.password_vault_ref || mailbox.imap?.secret_ref || mailbox.imap?.password_env || "";
      const smtpRef =
        mailbox.smtp?.vault_ref || mailbox.smtp?.password_vault_ref || mailbox.smtp?.secret_ref || mailbox.smtp?.password_env || "";
      return {
        mailbox_id: mailbox.mailbox_id || "",
        display_name: mailbox.display_name || mailbox.primary_email || mailbox.mailbox_id || "",
        primary_email: mailbox.primary_email || "",
        provider: mailbox.provider || "imap",
        aliases: mailbox.aliases || [],
        folders: mailbox.support_folders_or_labels || ["INBOX"],
        mailbox_group_id: mailbox.mailbox_group_id || "",
        imap_host: mailbox.imap?.host || "",
        imap_username: mailbox.imap?.username || "",
        smtp_host: mailbox.smtp?.host || "",
        smtp_username: mailbox.smtp?.username || "",
        imap_password_env: imapRef,
        smtp_password_env: smtpRef,
        imap_env_configured: Boolean(imapRef),
        smtp_env_configured: Boolean(smtpRef),
        identities: identitiesByMailbox.get(mailbox.mailbox_id) || [],
      };
    }),
  };
}

export function cleanText(value = "", limit = 5000) {
  let text = String(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  if (text.length > limit) text = `${text.slice(0, limit).trimEnd()}\n\n[trimmed]`;
  return text;
}

export function htmlToText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function sanitizeHtmlEmail(value = "", limit = 180000) {
  let html = String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ")
    .replace(/<(object|embed|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
  if (html.length > limit) html = `${html.slice(0, limit).trimEnd()}\n<!-- trimmed -->`;
  return html;
}

export function shortQuote(body = "", maxLines = 6) {
  const lines = [];
  for (const rawLine of String(body).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(unsubscribe|view this email|copyright)/i.test(line)) continue;
    lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines.join("\n").slice(0, 900);
}

export function summaryFrom(subject, body) {
  const compact = cleanText(body, 700).replace(/\n/g, " ");
  return compact ? compact.slice(0, 420) : subject || "(no subject)";
}

export function normalizeLanguageCode(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text || text === "auto") return "";
  if (/(^zh\b|zh-|chinese|mandarin|cantonese|中文|汉语|普通话|粤语|廣東話)/i.test(text)) return "zh-CN";
  if (/(^en\b|en-|english|英文)/i.test(text)) return "en";
  return "";
}

export function preferredUserLanguage(config: Config = {}) {
  const candidates = [
    process.env.KELLY_EMAIL_USER_LANGUAGE,
    config.style?.default_language,
    ...(Array.isArray(config.user_profile?.languages) ? config.user_profile.languages : []),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) return normalized;
  }
  return "en";
}

export function detectTextLanguage(value = "") {
  const text = String(value || "");
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk >= 4 && cjk / Math.max(text.length, 1) > 0.04) return "zh-CN";
  if (latin >= 12) return "en";
  return "unknown";
}

function fillTemplate(value, params = {}) {
  return String(value || "").replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

const REVIEW_COPY = {
  en: {
    background: '{sender} sent "{subject}". {summary}',
    why_default: "Needs a human decision before mailbox changes.",
    recommend_default:
      "Read the original message, then write your instruction in Review note. If it is safe cleanup, approve archive.",
    recommend_money:
      "Confirm whether this needs finance/payment handling. If no action is needed, approve archive; otherwise write what I should do next.",
    recommend_course:
      "Review the student's submission or feedback first. Add a note if you want me to summarize or draft a reply.",
    recommend_security:
      "Check whether this involves account, privacy, security, or permission changes before approving cleanup.",
    recommend_partnership:
      "Decide whether this is worth pursuing. You can ask me to draft a short reply, forward internally, or archive.",
    recommend_customer:
      "A reply is likely needed. Edit the draft below, approve send when ready, or leave one direction for me to refine.",
    recommend_attachments: "Review the attachment context before cleanup. Ask me to summarize or reply if needed.",
  },
  "zh-CN": {
    background: "{sender} 发来 “{subject}”。{summary}",
    why_default: "在更改邮箱前需要人工决定。",
    recommend_default: "先读邮件原文，再在审核备注里写你的处理意见。如果只是安全清理，可以批准归档。",
    recommend_money: "建议先确认金额、账单或凭证是否需要财务处理；确认无后续动作再归档，或写明要我如何回复/转发。",
    recommend_course: "建议先查看学生提交内容和反馈要点；如果需要回复，写一句方向，我再起草。",
    recommend_security: "建议先确认是否涉及账号、安全、隐私或权限变更；不要直接归档，除非你确认只是通知。",
    recommend_partnership: "建议判断是否有合作价值；可以让我起草简短回复、转给同事，或确认不感兴趣后归档。",
    recommend_customer: "建议回复。下面给了一个短草稿；你可以直接改草稿后批准发送，或写一句方向让我继续打磨。",
    recommend_attachments: "建议先看附件语境；确认附件不需要处理后再归档，或写明要我总结/回复什么。",
  },
};

function recommendationKeyFor(category: string, risks: Set<string>, attachments: Attachment[]) {
  if (category === "money" || risks.has("money")) return "recommend_money";
  if (category === "course_feedback") return "recommend_course";
  if (category === "data_privacy_security" || risks.has("security")) return "recommend_security";
  if (category === "partnership") return "recommend_partnership";
  if (category === "customer") return "recommend_customer";
  if (attachments.length) return "recommend_attachments";
  return "recommend_default";
}

function firstConfiguredBrand(config: Config = {}): Brand {
  const brands = Array.isArray(config.brands) ? config.brands : [];
  return brands.find((brand) => brand?.name || brand?.homepage) || {};
}

function configuredProductName(config: Config = {}) {
  const brand = firstConfiguredBrand(config);
  const identity = (config.identities || []).find((row) => row?.brand_or_product);
  return brand.name || identity?.brand_or_product || config.user_profile?.company || "your product";
}

function configuredPrimaryUrl(config: Config = {}) {
  const brand = firstConfiguredBrand(config);
  return (
    config.official_urls?.primary_cta ||
    config.official_urls?.homepage ||
    config.style?.cta_urls?.default ||
    brand.homepage ||
    ""
  );
}

function configuredContactLine(config: Config = {}) {
  const methods = Array.isArray(config.user_profile?.contact_methods) ? config.user_profile.contact_methods : [];
  const visible = methods
    .filter((method) => method?.label && method?.value)
    .slice(0, 3)
    .map((method) => `${method.label}: ${method.value}`);
  return visible.length ? `\n\nYou can also reach me here: ${visible.join(" · ")}` : "";
}

export function reviewRecommendationFor(
  classification: {
    category?: string;
    risk?: string[];
    reason_i18n?: Record<string, string>;
    [key: string]: unknown;
  },
  sender: string,
  subject: string,
  body: string,
  attachments: Attachment[] = [],
  config: Config = {},
) {
  const category = classification.category || "other";
  const risks = new Set(classification.risk || []);
  const bodyHint = summaryFrom(subject, body);
  let suggestedReply = "";
  const userLanguage = preferredUserLanguage(config);
  const sourceLanguage = detectTextLanguage(`${subject}\n${body}`);
  const recommendationKey = recommendationKeyFor(category, risks, attachments);
  const i18n: Record<string, { background: string; why_review: string; recommendation: string }> = {};
  for (const language of ["en", "zh-CN"]) {
    const copy = REVIEW_COPY[language];
    i18n[language] = {
      background: fillTemplate(copy.background, {
        sender: sender || (language === "zh-CN" ? "未知发件人" : "Unknown sender"),
        subject: subject || (language === "zh-CN" ? "（无主题）" : "(no subject)"),
        summary: bodyHint,
      }).slice(0, 620),
      why_review: classification.reason_i18n?.[language] || copy.why_default,
      recommendation: copy[recommendationKey] || copy.recommend_default,
    };
  }
  const productName = configuredProductName(config);
  const primaryUrl = configuredPrimaryUrl(config);
  const ctaLine = primaryUrl ? `\n\nYou can take a look here: ${primaryUrl}` : "";
  const contactLine = configuredContactLine(config);

  if (category === "customer") {
    suggestedReply = `Hi,\n\nThanks for sharing this. This sounds like a good fit for an agent workflow: turn the repeated steps into a clear prompt or skill, test it in a few sessions, and then refine the parts that need better context or tooling.\n\nFor ${productName}, I would start by writing down the desired outcome, the source materials, the steps you want automated, and one example of a good final result. Then try that prompt in a new agent/session and improve it from the output.\n\nCould you share which part is most painful today and what a successful result should look like?${ctaLine}${contactLine}`;
  }

  const preferred = i18n[userLanguage] || i18n.en;
  return {
    user_language: userLanguage,
    source_language: sourceLanguage,
    translation_language: userLanguage,
    i18n,
    background: preferred.background,
    why_review: preferred.why_review,
    recommendation: preferred.recommendation,
    suggested_reply: suggestedReply,
  };
}

export function stableItemId(mailboxId, uid, messageId, subject) {
  return createHash("sha1")
    .update(`${mailboxId}:${uid}:${messageId || ""}:${subject || ""}`)
    .digest("hex")
    .slice(0, 16);
}

export function safeFilename(value, fallback) {
  const source = String(value || fallback || "attachment.bin")
    .replace(/[/:\\]/g, "_")
    .replace(/[^\p{L}\p{N}._()[\]\- @]+/gu, "_")
    .replace(/^[ ._]+|[ ._]+$/g, "")
    .slice(0, 160);
  return source || fallback || "attachment.bin";
}

export async function clearBatchAttachments(batchId) {
  const provider = createProvider();
  if (provider.clearBatchAttachments) return provider.clearBatchAttachments(batchId);
  await rm(join(ATTACHMENTS_DIR, batchId), { recursive: true, force: true });
}

export async function persistAttachments(batchId: string, itemId: string, htmlBody: string, attachments: Attachment[]) {
  const provider = createProvider();
  if (provider.persistAttachments) return provider.persistAttachments(batchId, itemId, htmlBody, attachments);
  const itemDir = join(ATTACHMENTS_DIR, batchId, itemId);
  await mkdir(itemDir, { recursive: true });
  const cidUrls = new Map();
  const saved = [];

  for (const [index, attachment] of attachments.entries()) {
    const content = attachment.content || Buffer.alloc(0);
    let filename = safeFilename(
      attachment.filename,
      `attachment-${index + 1}${extname(attachment.filename || "") || ".bin"}`,
    );
    let path = join(itemDir, filename);
    if (existsSync(path)) {
      const extension = extname(filename);
      const stem = basename(filename, extension);
      filename = `${stem}-${index + 1}${extension}`;
      path = join(itemDir, filename);
    }
    await writeFile(path, content);
    const url = `/attachments/${batchId}/${itemId}/${filename}`;
    const contentId = String(attachment.contentId || "").replace(/^<|>$/g, "");
    if (contentId) cidUrls.set(contentId, url);
    saved.push({
      filename,
      content_type: attachment.contentType || "application/octet-stream",
      size: attachment.size || content.length,
      content_id: contentId,
      url,
      preview:
        String(attachment.contentType || "").startsWith("image/") || attachment.contentType === "application/pdf",
    });
  }

  let html = htmlBody || "";
  for (const [contentId, url] of cidUrls.entries()) {
    html = html.replaceAll(`cid:${contentId}`, url).replaceAll(`CID:${contentId}`, url);
  }
  return { html, attachments: saved };
}

export function hasMoneySignal(text) {
  return [
    /\$\s?\d/i,
    /\b(USD|HKD|RMB|CNY)\b/i,
    /\b(invoice|receipt|payment|paid|refund|charge|subscription|billing|payout|bank|tax)\b/i,
    /付款|支付|发票|收据|退款|收费|续费|订阅|银行|税/,
  ].some((pattern) => pattern.test(text));
}

export function hasStrongMoneySignal(sender, subject, body) {
  const header = `${sender}\n${subject}`;
  const leadingBody = String(body || "").slice(0, 1200);
  const patterns = [
    /\b(invoice|receipt|billing|payment receipt|payment due)\b/i,
    /\b(refund|chargeback|paid subscription|sponsorship amount|next billing date)\b/i,
    /\bsubscription.*(starts|renew|ending|due)\b/i,
    /账单|发票|付款通知|付款单|支付|提交凭证|余量预警|按量计费|续包|限额告警/,
  ];
  return patterns.some((pattern) => pattern.test(header) || pattern.test(leadingBody));
}

export function isCourseSubmission(sender, subject, body) {
  return /course_homework|course_feedback|course lesson feedback|course homework|new course|homework submission|lesson feedback|课后作业|课程反馈|作业提交/i.test(
    `${sender}\n${subject}\n${String(body || "").slice(0, 1600)}`,
  );
}

function keywordMatch(text, keywords = []) {
  return keywords.some((keyword) => keyword && text.toLowerCase().includes(String(keyword).toLowerCase()));
}

export function configuredRiskSignal(config: Config, riskName: string, text: string) {
  return keywordMatch(text, config?.risk_policy?.review_keywords?.[riskName] || []);
}

export function classify(
  sender: string,
  subject: string,
  body: string,
  attachments: Attachment[] = [],
  config: Config = {},
) {
  const text = `${sender}\n${subject}\n${body}`.toLowerCase();
  const original = `${sender}\n${subject}\n${body}`;

  if (isCourseSubmission(sender, subject, body)) {
    return {
      category: "course_feedback",
      risk: [],
      status: "needs_review",
      proposed_action: "review",
      reason: "课程反馈或作业提交需要展开内容给你看。",
    };
  }
  if (hasStrongMoneySignal(sender, subject, body)) {
    return {
      category: "money",
      risk: ["money"],
      status: "needs_review",
      proposed_action: "review",
      reason: "强账单、支付、凭证、订阅或额度信号，按金钱规则停下给你 review。",
    };
  }
  if (configuredRiskSignal(config, "money", original)) {
    return {
      category: "money",
      risk: ["money"],
      status: "needs_review",
      proposed_action: "review",
      reason: "命中本地配置的 money review keyword，停下给你 review。",
    };
  }
  if (
    /newsletter|digest|weekly|monthly|webinar|event|invitation|linkedin|github|mongodb atlas|acquire|notification|no-?reply|noreply|beehiiv|discoursemail|community roadmap|product roadmap|onboarding submission|form submission|new submission|unsubscribe|marketing|product update|通知|邀请|摘要|简报|订阅|营销/i.test(
      text,
    )
  ) {
    return {
      category: "marketing",
      risk: [],
      status: "prepared",
      proposed_action: "archive",
      reason: "低风险通知、表单、摘要或营销邮件，准备归档，等你在 UI 批准。",
    };
  }
  if (hasMoneySignal(original)) {
    return {
      category: "money",
      risk: ["money"],
      status: "needs_review",
      proposed_action: "review",
      reason: "涉及金额、付款、订阅、账单或收据，按金钱规则停下给你 review。",
    };
  }
  if (
    /security|privacy|vulnerability|password|login|account access|data deletion|compliance|安全|隐私|漏洞|登录/i.test(
      text,
    )
  ) {
    return {
      category: "data_privacy_security",
      risk: ["security"],
      status: "needs_review",
      proposed_action: "review",
      reason: "可能涉及账号、安全、隐私或合规，不能自动清理。",
    };
  }
  if (configuredRiskSignal(config, "security", original)) {
    return {
      category: "data_privacy_security",
      risk: ["security"],
      status: "needs_review",
      proposed_action: "review",
      reason: "命中本地配置的 security review keyword，停下给你 review。",
    };
  }
  if (/refund|cancel|angry|complaint|not working|bug|error|failed|broken|无法|不能|错误|失败|崩溃/i.test(text)) {
    return {
      category: "customer",
      risk: [],
      status: "needs_review",
      proposed_action: "review",
      reason: "可能是客户问题、投诉或 bug，需要人工判断。",
    };
  }
  if (/partnership|collaboration|sponsor|affiliate|reseller|合作|赞助|代理|推广/i.test(text)) {
    return {
      category: "partnership",
      risk: [],
      status: "needs_review",
      proposed_action: "review",
      reason: "合作或销售机会需要你确认方向。",
    };
  }
  if (attachments.length) {
    return {
      category: "other",
      risk: ["attachment"],
      status: "needs_review",
      proposed_action: "review",
      reason: "真实来信且带附件，需要人工判断附件语境。",
    };
  }
  if (/@[a-z0-9.-]+/i.test(sender) && !/no-?reply|noreply|notification/i.test(sender)) {
    return {
      category: "customer",
      risk: [],
      status: "needs_review",
      proposed_action: "review",
      reason: "真实联系人来信，意图不适合自动清理。",
    };
  }
  return {
    category: "other",
    risk: [],
    status: "prepared",
    proposed_action: "archive",
    reason: "未发现需要回复的支持信号，准备归档，等你在 UI 批准。",
  };
}

export function decisionAction(item: ReviewItem) {
  return item?.decision?.action || "";
}

export function executionStatus(item: ReviewItem) {
  return item?.execution?.status || "";
}

export function isDone(item: ReviewItem) {
  return item.status === "executed" || executionStatus(item) === "executed" || decisionAction(item) === "no_action";
}

export function isBlocked(item: ReviewItem) {
  return executionStatus(item) === "blocked";
}

export function isDraftAwaitingSendReview(item: ReviewItem) {
  return item.status === "drafted" && !decisionAction(item) && !isDone(item) && !isBlocked(item);
}

export function isNeedsReview(item: ReviewItem) {
  return (
    !isDone(item) &&
    !isBlocked(item) &&
    (isDraftAwaitingSendReview(item) ||
      item.status === "needs_review" ||
      ["needs_review", "revise"].includes(decisionAction(item)))
  );
}

export function isToApprove(item: ReviewItem) {
  return (
    !isDone(item) && !isBlocked(item) && !isNeedsReview(item) && !decisionAction(item) && item.status === "prepared"
  );
}

export function isApproved(item: ReviewItem) {
  const action = decisionAction(item);
  if (isDone(item) || isBlocked(item)) return false;
  if (action === "draft_reply") return item.status === "draft_requested";
  if (["archive", "mark_read", "send_reply"].includes(action)) return true;
  return isToApprove(item);
}
