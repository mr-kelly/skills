import type { Batch, DecisionsPayload, ReviewItem } from "../types.ts";
import type { DecisionInput, DetailInput } from "./provider-interface.ts";

export const LOCAL_ACTIONS = new Set([
  "approve_proposed",
  "approve_archive",
  "approve_mark_read",
  "approve_send",
  "draft_reply",
  "needs_review",
  "no_action",
  "revise",
]);

export function utcNow() {
  return new Date().toISOString();
}

export function emptyBatch(): Batch {
  return {
    batch_id: "empty",
    generated_at: utcNow(),
    source: "empty",
    items: [],
  };
}

export function normalizeItem(item: ReviewItem): ReviewItem {
  const uid = String(item.uid || item.id || item.message_id || "");
  let status = item.review_status || item.status || "needs_review";
  if (status === "safe_cleanup") status = "prepared";
  if (["archived", "sent", "read"].includes(status)) status = `already_${status}`;
  const decision = item.decision || {};
  return {
    id: String(item.id || uid),
    uid,
    thread_id: item.thread_id || item.message_id || uid,
    account: item.account || "",
    from: item.from || "",
    to: item.to || "",
    date: item.date || "",
    subject: item.subject || "(no subject)",
    category: item.category || "other",
    risk: item.risk || [],
    status,
    proposed_action: item.proposed_action || item.recommended_action || "review",
    reason: item.reason || item.review_reason || "",
    review_brief: item.review_brief || {},
    suggested_reply: item.suggested_reply || item.review_brief?.suggested_reply || "",
    summary: item.summary || item.body_preview || "",
    body: item.body || item.body_preview || "",
    body_original: item.body_original || item.body || item.body_preview || "",
    body_original_language: item.body_original_language || item.source_language || "",
    body_translation: item.body_translation || item.translated_body || "",
    body_translation_language: item.body_translation_language || item.translation_language || item.user_language || "",
    user_language: item.user_language || item.review_brief?.user_language || "",
    source_language: item.source_language || item.body_original_language || "",
    html: item.html || "",
    has_html: Boolean(item.has_html || item.html),
    quote_preview: item.quote_preview || "",
    attachments: item.attachments || [],
    draft: item.draft || "",
    decision,
    execution: item.execution || {},
    execution_override: item.execution_override || {},
    user_comment: item.user_comment || decision.comment || "",
    updated_at: item.updated_at || utcNow(),
    folder: item.folder || "",
    message_id: item.message_id || "",
    cc: item.cc || "",
    classification_method: item.classification_method,
    classification_pipeline_version: item.classification_pipeline_version,
    rule_prefilter: item.rule_prefilter,
    agent_review: item.agent_review,
  };
}

export function normalizeBatch(batch: Batch): Batch {
  return {
    ...batch,
    items: (batch.items || []).map(normalizeItem),
  };
}

export function decisionsFromBatch(batch: Batch): DecisionsPayload {
  const decisions: DecisionsPayload["decisions"] = [];
  for (const item of batch.items || []) {
    const decision = item.decision || {};
    if (!decision.action) continue;
    decisions.push({
      id: item.id,
      uid: item.uid,
      thread_id: item.thread_id,
      subject: item.subject,
      from: item.from,
      proposed_action: item.proposed_action,
      decision,
      edited_draft: item.draft || "",
      suggested_reply: item.suggested_reply || item.review_brief?.suggested_reply || "",
      comment: item.user_comment || "",
    });
  }
  return {
    batch_id: batch.batch_id,
    updated_at: utcNow(),
    decisions,
  };
}

export function findItem(batch: Batch, itemId: string): ReviewItem {
  const item = (batch.items || []).find(
    (candidate) => String(candidate.id) === String(itemId) || String(candidate.uid) === String(itemId),
  );
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}

function approvedActionFor(action: string, item: ReviewItem) {
  if (action === "approve_proposed") {
    const proposed = item.proposed_action || "review";
    return ["review", "needs_review", "revise"].includes(proposed) ? "needs_review" : proposed;
  }
  if (action === "approve_archive") return "archive";
  if (action === "approve_mark_read") return "mark_read";
  if (action === "approve_send") return "send_reply";
  if (action === "draft_reply") return "draft_reply";
  if (action === "needs_review") return "needs_review";
  if (action === "no_action") return "no_action";
  return "revise";
}

function updateItemStatus(item: ReviewItem, approvedAction: string) {
  if (approvedAction === "draft_reply") item.status = "draft_requested";
  else if (["review", "needs_review", "revise"].includes(approvedAction)) item.status = "needs_review";
  else if (approvedAction === "send_reply") item.status = "drafted";
  else if (approvedAction === "no_action") item.status = item.status || "prepared";
  else if (!["prepared", "drafted"].includes(item.status || "")) item.status = "prepared";
}

export function applyItemsDecision(batch: Batch, input: DecisionInput) {
  const ids = (input.ids || []).map(String);
  const action = input.action || "";
  const hasComment = Object.hasOwn(input, "comment");
  const comment = String(input.comment || "");
  const hasDraft = Object.hasOwn(input, "draft");
  const hasSuggestedReply = Object.hasOwn(input, "suggested_reply");
  if (!ids.length) throw new Error("No items selected");
  if (!LOCAL_ACTIONS.has(action)) throw new Error(`Unsupported local decision: ${action}`);
  const changed: string[] = [];
  for (const itemId of ids) {
    const item = findItem(batch, itemId);
    if (hasDraft) item.draft = String(input.draft || "");
    if (hasSuggestedReply) item.suggested_reply = String(input.suggested_reply || "");
    const approvedAction = approvedActionFor(action, item);
    item.decision = {
      action: approvedAction,
      decided_at: utcNow(),
    };
    updateItemStatus(item, approvedAction);
    if (hasComment) {
      item.user_comment = comment;
      if (comment) item.decision.comment = comment;
    }
    item.updated_at = utcNow();
    changed.push(item.id);
  }
  return changed;
}

export function applyDetailUpdate(batch: Batch, input: DetailInput) {
  const item = findItem(batch, String(input.id));
  if (Object.hasOwn(input, "draft")) item.draft = input.draft || "";
  if (Object.hasOwn(input, "suggested_reply")) item.suggested_reply = input.suggested_reply || "";
  if (Object.hasOwn(input, "comment")) item.user_comment = input.comment || "";
  item.updated_at = utcNow();
  return item;
}
