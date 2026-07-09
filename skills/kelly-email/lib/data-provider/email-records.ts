import type { Attachment, Batch, ReviewBrief, ReviewItem } from "../types.ts";
import { decisionsFromBatch, emptyBatch, normalizeBatch, normalizeItem, utcNow } from "./provider-utils.ts";

export const EMAIL_RECORD_KIND = "review_item";

export interface EmailRecordRow {
  record_id: string;
  [key: string]: unknown;
}

function text(value: unknown) {
  return String(value ?? "");
}

function compactText(value: unknown, limit = 1800) {
  const source = text(value).replace(/\s+/g, " ").trim();
  return source.length > limit ? `${source.slice(0, limit).trimEnd()}...` : source;
}

function dateText(value: unknown) {
  const source = text(value).trim();
  if (!source) return "";
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? source : date.toISOString();
}

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const source = text(value).trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(source);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function objectValue<T extends Record<string, unknown>>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
}

function lines(values: unknown[]) {
  return values
    .map((value) => text(value).trim())
    .filter(Boolean)
    .join("\n");
}

function commaList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => text(entry).trim()).filter(Boolean);
  return text(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseAttachmentRefs(value: unknown): Attachment[] {
  if (Array.isArray(value)) return value as Attachment[];
  const source = text(value).trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed as Attachment[];
  } catch {
    // Human-readable attachment lines are also accepted below.
  }
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [filename = line, contentType = "", size = "", url = ""] = line.split("|").map((part) => part.trim());
      return {
        filename,
        content_type: contentType,
        size: numberValue(size),
        url,
        preview: contentType.startsWith("image/") || contentType === "application/pdf",
      };
    });
}

function attachmentRefs(attachments: Attachment[]) {
  return attachments.map((attachment) => ({
    filename: attachment.filename || "",
    content_type: attachment.content_type || attachment.contentType || "",
    size: numberValue(attachment.size),
    url: attachment.url || "",
    preview: Boolean(attachment.preview),
  }));
}

function attachmentRefsText(attachments: Attachment[]) {
  return attachmentRefs(attachments)
    .map((attachment) =>
      [attachment.filename, attachment.content_type, attachment.size || "", attachment.url].map(text).join(" | "),
    )
    .join("\n");
}

function reviewBriefText(brief: ReviewBrief | undefined, key: keyof ReviewBrief) {
  return text(objectValue<ReviewBrief>(brief)[key]);
}

function decisionAction(item: ReviewItem) {
  return text(item.decision?.action).trim();
}

function executionError(execution: Record<string, unknown>) {
  return text(execution.error || execution.error_message || execution.reason).trim();
}

export function emailRecordId(item: ReviewItem | Record<string, unknown>) {
  const candidate = text(item.id || item.uid || item.message_id || item.thread_id).trim();
  return `email-item-${candidate || "unknown"}`;
}

export function reviewItemToEmailRecordFields(item: ReviewItem, batchId = ""): EmailRecordRow {
  const next = normalizeItem(item);
  const brief = objectValue<ReviewBrief>(next.review_brief);
  const execution = objectValue<Record<string, unknown>>(next.execution);
  const attachments = Array.isArray(next.attachments) ? next.attachments : [];
  const bodyText = text(next.body || next.body_original || next.body_preview);
  const suggestedReply = text(next.suggested_reply || brief.suggested_reply);
  const draftText = text(next.draft);
  return {
    record_id: emailRecordId(next),
    kind: EMAIL_RECORD_KIND,
    batch_id: batchId,
    item_id: next.id,
    email_uid: compactText(next.uid, 80),
    thread_id: compactText(next.thread_id, 240),
    message_id: compactText(next.message_id, 240),
    folder: compactText(next.folder, 120),
    subject: compactText(next.subject, 400),
    sender: compactText(next.from, 400),
    recipients: compactText(next.to, 1200),
    cc: compactText(next.cc, 1200),
    source_account: compactText(next.account, 160),
    email_date: dateText(next.date),
    category: compactText(next.category, 120),
    risk: Array.isArray(next.risk) ? next.risk.join(", ") : "",
    reason: text(next.reason || next.review_reason),
    summary: text(next.summary || next.body_preview),
    review_background: reviewBriefText(brief, "background"),
    review_recommendation: reviewBriefText(brief, "recommendation"),
    review_why: reviewBriefText(brief, "why_review"),
    body_text: bodyText,
    body_original: text(next.body_original || bodyText),
    body_translation: text(next.body_translation || next.translated_body),
    body_excerpt: compactText(bodyText, 1800),
    quote_preview: text(next.quote_preview),
    html_excerpt: compactText(next.html, 1800),
    draft_text: draftText,
    suggested_reply: suggestedReply,
    draft_excerpt: compactText(draftText, 1200),
    user_comment: text(next.user_comment || next.decision?.comment),
    decision_action: decisionAction(next),
    decided_at: dateText(next.decision?.decided_at),
    execution_status: compactText(execution.status, 80),
    mailbox_operation: compactText(execution.mailbox_operation || execution.operation, 160),
    target_folder: compactText(
      execution.target_folder || execution.target || next.target_folder || next.archive_folder,
      400,
    ),
    executed_at: dateText(execution.executed_at || execution.checked_at),
    execution_reason: text(execution.reason),
    execution_error: executionError(execution),
    has_html: Boolean(next.has_html || next.html),
    has_draft: Boolean(draftText.trim()),
    has_translation: Boolean(text(next.body_translation || next.translated_body).trim()),
    has_attachments: attachments.length > 0,
    drive_path: batchId ? `batches/${batchId}.json` : "state/current_batch.json",
    html_drive_path: next.html ? `attachments/${batchId}/${next.id}/html` : "",
    attachments_drive_path: attachments.length && batchId ? `attachments/${batchId}/${next.id}` : "",
    attachment_count: attachments.length,
    attachment_names: attachments
      .map((attachment) => attachment.filename)
      .filter(Boolean)
      .join(", "),
    attachment_refs: attachmentRefsText(attachments),
    classification_method: compactText(next.classification_method, 160),
    user_language: compactText(next.user_language || brief.user_language, 40),
    source_language: compactText(next.source_language || next.body_original_language, 40),
    body_original_language: compactText(next.body_original_language || next.source_language, 40),
    body_translation_language: compactText(
      next.body_translation_language || next.translation_language || next.user_language || brief.user_language,
      40,
    ),
    status: next.status,
    proposed_action: next.proposed_action,
    updated_at: dateText(next.updated_at || utcNow()),
    created_at: dateText(next.created_at || next.generated_at || next.date || next.updated_at || utcNow()),
  };
}

export function emailRecordFieldsToReviewItem(fields: Record<string, unknown>): ReviewItem {
  const decision = text(fields.decision_action).trim()
    ? {
        action: text(fields.decision_action).trim(),
        decided_at: text(fields.decided_at).trim(),
        comment: text(fields.user_comment).trim(),
      }
    : {};
  const execution = text(fields.execution_status).trim()
    ? {
        status: text(fields.execution_status).trim(),
        action: text(fields.decision_action || fields.proposed_action).trim(),
        mailbox_operation: text(fields.mailbox_operation).trim(),
        target_folder: text(fields.target_folder).trim(),
        reason: text(fields.execution_reason).trim(),
        error: text(fields.execution_error).trim(),
        executed_at: text(fields.executed_at).trim(),
      }
    : {};
  const body = text(fields.body_text || fields.body_original || fields.body_excerpt);
  const suggestedReply = text(fields.suggested_reply);
  const draftText = text(fields.draft_text || fields.draft_excerpt);
  const attachments = parseAttachmentRefs(fields.attachment_refs);
  return normalizeItem({
    id: text(fields.item_id || fields.record_id).trim(),
    uid: text(fields.email_uid || fields.item_id || fields.record_id).trim(),
    thread_id: text(fields.thread_id || fields.message_id || fields.item_id).trim(),
    message_id: text(fields.message_id).trim(),
    account: text(fields.source_account).trim(),
    folder: text(fields.folder).trim(),
    from: text(fields.sender).trim(),
    to: text(fields.recipients).trim(),
    cc: text(fields.cc).trim(),
    date: text(fields.email_date).trim(),
    subject: text(fields.subject || "(no subject)").trim(),
    category: text(fields.category || "other").trim(),
    risk: commaList(fields.risk),
    reason: text(fields.reason).trim(),
    review_brief: {
      background: text(fields.review_background).trim(),
      why_review: text(fields.review_why || fields.reason).trim(),
      recommendation: text(fields.review_recommendation).trim(),
      suggested_reply: suggestedReply,
      user_language: text(fields.user_language).trim(),
    },
    suggested_reply: suggestedReply,
    summary: text(fields.summary || fields.body_excerpt).trim(),
    body,
    body_preview: text(fields.body_excerpt || fields.summary).trim(),
    body_original: text(fields.body_original || body).trim(),
    body_original_language: text(fields.body_original_language || fields.source_language).trim(),
    body_translation: text(fields.body_translation).trim(),
    body_translation_language: text(fields.body_translation_language || fields.user_language).trim(),
    user_language: text(fields.user_language).trim(),
    source_language: text(fields.source_language || fields.body_original_language).trim(),
    html: text(fields.html_excerpt).trim(),
    has_html: boolValue(fields.has_html),
    quote_preview: text(fields.quote_preview).trim(),
    attachments,
    draft: draftText.trim(),
    decision,
    execution,
    user_comment: text(fields.user_comment).trim(),
    updated_at: text(fields.updated_at).trim(),
    classification_method: text(fields.classification_method).trim(),
    status: text(fields.status || "needs_review").trim(),
    proposed_action: text(fields.proposed_action || "review").trim(),
    target_folder: text(fields.target_folder).trim(),
    archive_folder: text(fields.target_folder).trim(),
  });
}

export function batchFromEmailRecords(rows: Record<string, unknown>[], preferredBatchId = ""): Batch {
  const reviewRows = rows.filter((row) => text(row.kind || EMAIL_RECORD_KIND) === EMAIL_RECORD_KIND);
  const requestedBatchId = text(preferredBatchId).trim();
  if (!reviewRows.length) {
    const empty = emptyBatch();
    return requestedBatchId ? { ...empty, batch_id: requestedBatchId } : empty;
  }
  const latestRows = requestedBatchId
    ? reviewRows.filter((row) => text(row.batch_id).trim() === requestedBatchId)
    : latestBatchRows(reviewRows);
  if (!latestRows.length) {
    return normalizeBatch({
      ...emptyBatch(),
      batch_id: requestedBatchId,
      source: "email-records",
      mode: "app-in-skill",
    });
  }
  const batchId = text(latestRows[0]?.batch_id || "email-records").trim();
  const items = latestRows.map(emailRecordFieldsToReviewItem);
  const updatedAt =
    latestRows
      .map((row) => text(row.updated_at))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || utcNow();
  return normalizeBatch({
    batch_id: batchId || "email-records",
    generated_at: text(latestRows[0]?.created_at || latestRows[0]?.email_date || updatedAt),
    updated_at: updatedAt,
    source: "email-records",
    mode: "app-in-skill",
    items,
  });
}

function latestBatchRows(rows: Record<string, unknown>[]) {
  const groups = new Map<string, { rows: Record<string, unknown>[]; updatedAt: string }>();
  for (const row of rows) {
    const batchId = text(row.batch_id || "email-records").trim() || "email-records";
    const group = groups.get(batchId) || { rows: [], updatedAt: "" };
    const updatedAt = text(row.updated_at || row.created_at || row.email_date);
    group.rows.push(row);
    if (updatedAt > group.updatedAt) group.updatedAt = updatedAt;
    groups.set(batchId, group);
  }
  return [...groups.entries()].sort((a, b) => {
    const byUpdated = b[1].updatedAt.localeCompare(a[1].updatedAt);
    return byUpdated || b[0].localeCompare(a[0]);
  })[0][1].rows;
}

export function rowsFromBatch(batch: Batch): EmailRecordRow[] {
  const next = normalizeBatch(batch);
  return (next.items || []).map((item) => reviewItemToEmailRecordFields(item, next.batch_id || ""));
}

export function decisionsFromEmailRecords(rows: Record<string, unknown>[]) {
  return decisionsFromBatch(batchFromEmailRecords(rows));
}

export function tabularBatchDescription(batch: Batch) {
  const count = batch.items?.length || 0;
  return lines([batch.batch_id ? `batch ${batch.batch_id}` : "", `${count} review items`]);
}
