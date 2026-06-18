import fs from "node:fs/promises";
import path from "node:path";
import { BATCH_DIR, CACHE_DIR, CURRENT_BATCH_PATH, DECISIONS_PATH, LEGACY_REVIEW_ITEMS_PATH } from "./paths.mjs";
import { pathExists, readJson, utcNow, writeJson } from "./utils.mjs";

export async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(BATCH_DIR, { recursive: true });
}

export function normalizeItem(item) {
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

async function convertLegacyCache() {
  if (!(await pathExists(LEGACY_REVIEW_ITEMS_PATH))) {
    return {
      batch_id: "empty",
      generated_at: utcNow(),
      source: "empty",
      items: [],
    };
  }
  const raw = await readJson(LEGACY_REVIEW_ITEMS_PATH);
  const items = Object.values(raw.items || {}).map(normalizeItem);
  const batch = {
    batch_id: `legacy-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`,
    generated_at: raw.updated_at || utcNow(),
    source: "legacy-review-items",
    last_scan: raw.last_scan,
    items,
  };
  await saveBatch(batch);
  return batch;
}

export async function loadBatch() {
  await ensureDirs();
  if (await pathExists(CURRENT_BATCH_PATH)) {
    const batch = await readJson(CURRENT_BATCH_PATH);
    batch.items = (batch.items || []).map(normalizeItem);
    return batch;
  }
  return convertLegacyCache();
}

export async function saveBatch(batch) {
  await ensureDirs();
  batch.updated_at = utcNow();
  await writeJson(CURRENT_BATCH_PATH, batch);
  const batchId = batch.batch_id || "current";
  await writeJson(path.join(BATCH_DIR, `${batchId}.json`), batch);
}

export async function writeDecisions(batch) {
  const decisions = [];
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
  const payload = {
    batch_id: batch.batch_id,
    updated_at: utcNow(),
    decisions,
  };
  await writeJson(DECISIONS_PATH, payload);
  return payload;
}

export function findItem(batch, itemId) {
  const item = (batch.items || []).find(
    (candidate) => String(candidate.id) === String(itemId) || String(candidate.uid) === String(itemId),
  );
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}
