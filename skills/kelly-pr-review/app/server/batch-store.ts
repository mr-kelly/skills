import fs from "node:fs/promises";
import path from "node:path";
import { BATCH_DIR, CACHE_DIR, CURRENT_BATCH_PATH, DECISIONS_PATH } from "./paths.ts";
import { pathExists, readJson, utcNow, writeJson } from "./utils.ts";

const ACTIONS = new Set(["approve", "comment", "request_changes", "no_action", "needs_review", "block"]);

export async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(BATCH_DIR, { recursive: true });
}

export function normalizeItem(item, index = 0) {
  const repo = String(item.repo || item.repository || "");
  const number = Number.parseInt(item.number || item.pr_number || 0, 10) || 0;
  const id = String(item.id || (repo && number ? `${repo}#${number}` : `item-${index + 1}`));
  const decision = item.decision || {};
  const proposed = ACTIONS.has(item.proposed_action) ? item.proposed_action : "comment";
  return {
    id,
    review_ref: item.review_ref || "",
    repo,
    number,
    title: item.title || "(untitled pull request)",
    author: item.author || "",
    url: item.url || "",
    summary: item.summary || "",
    body: item.body || "",
    status: item.status || "needs_review",
    proposed_action: proposed,
    reason: item.reason || "",
    risk: Array.isArray(item.risk) ? item.risk : [],
    labels: Array.isArray(item.labels) ? item.labels : [],
    changed_files: Array.isArray(item.changed_files) ? item.changed_files : [],
    additions: Number(item.additions || 0),
    deletions: Number(item.deletions || 0),
    comments_count: Number(item.comments_count || 0),
    checks: item.checks || "",
    state: item.state || "",
    merged: Boolean(item.merged || item.status === "merged"),
    merged_at: item.merged_at || "",
    verification_status: item.verification_status || "",
    tested: Boolean(item.tested),
    tested_at: item.tested_at || "",
    test_note: item.test_note || "",
    test_evidence: Array.isArray(item.test_evidence) ? item.test_evidence : [],
    is_draft: Boolean(item.is_draft),
    created_at: item.created_at || "",
    updated_at: item.updated_at || utcNow(),
    review_body: item.review_body || item.suggested_review || "",
    patch_excerpt: item.patch_excerpt || "",
    decision,
    execution: item.execution || {},
  };
}

function emptyBatch() {
  return {
    batch_id: "empty",
    generated_at: utcNow(),
    source: "kelly-pr-review",
    mode: "app-in-skill",
    metrics: {},
    items: [],
  };
}

export async function loadBatch() {
  await ensureDirs();
  if (!(await pathExists(CURRENT_BATCH_PATH))) return emptyBatch();
  const batch = await readJson(CURRENT_BATCH_PATH);
  batch.items = (batch.items || []).map(normalizeItem);
  return batch;
}

export async function saveBatch(batch) {
  await ensureDirs();
  batch.updated_at = utcNow();
  batch.items = (batch.items || []).map(normalizeItem);
  await writeJson(CURRENT_BATCH_PATH, batch);
  await writeJson(path.join(BATCH_DIR, `${batch.batch_id || "current"}.json`), batch);
}

export function findItem(batch, itemId) {
  const item = (batch.items || []).find((candidate) => String(candidate.id) === String(itemId));
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}

export async function writeDecisions(batch) {
  const decisions = [];
  for (const item of batch.items || []) {
    const decision = item.decision || {};
    if (!decision.action) continue;
    decisions.push({
      id: item.id,
      repo: item.repo,
      number: item.number,
      title: item.title,
      url: item.url,
      proposed_action: item.proposed_action,
      decision,
      review_body: item.review_body || decision.review_body || "",
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
