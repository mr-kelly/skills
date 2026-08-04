// Pure domain logic for kelly-pr-review: turn normalized Busabase `reviews`
// records into the review-queue item shape the UI renders, plus the
// workflow-status bucketing and decision-status mapping. Ported verbatim
// (same variable names, same order of operations) from the retired
// lib/data-provider/local-file-provider.ts's normalizeItem() / workflow
// predicates / countByWorkflow() / matchesMode() / reposFor() — only TS types
// stripped, and the separate tested.json cache folded onto the review record
// itself (tested / tested_at / test_note / test_evidence live on the record).

export const DECISION_ACTIONS = ["approve", "comment", "request_changes", "no_action", "needs_review", "block"];
const APPROVED_ACTIONS = ["approve", "comment", "request_changes", "no_action"];

// Verdict -> item.status, ported verbatim from local-file-provider.ts's
// statusForAction().
export function statusForAction(action) {
  if (APPROVED_ACTIONS.includes(action)) return "approved";
  if (action === "block") return "blocked";
  return "needs_review";
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseJsonList(value) {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function toBool(value) {
  return value === true || value === "true";
}

// ---- Workflow predicates (ported verbatim from local-file-provider.ts) ----

export function isNeedsReview(item) {
  return item.status === "needs_review";
}
export function isToApprove(item) {
  return item.status === "to_approve";
}
export function isDone(item) {
  return item.status === "done" || item.execution_status === "executed";
}
export function isApprovedForExecution(item) {
  // An item that has already been executed is terminal ("done"); it must not
  // keep counting as "approved" just because the record's status field was
  // never cleared after scripts/execute_decisions.mjs ran.
  if (isDone(item)) return false;
  return item.status === "approved";
}
export function isBlocked(item) {
  return item.status === "blocked";
}

export function countByWorkflow(items = []) {
  return {
    needs_review: items.filter(isNeedsReview).length,
    to_approve: items.filter(isToApprove).length,
    approved: items.filter(isApprovedForExecution).length,
    done: items.filter(isDone).length,
    blocked: items.filter(isBlocked).length,
    needs_test: items.filter((item) => item.verification_status === "needs_test").length,
    tested: items.filter((item) => item.verification_status === "tested").length,
  };
}

export function matchesMode(item, mode) {
  if (mode === "all") return true;
  if (mode === "needs_review") return isNeedsReview(item);
  if (mode === "to_approve") return isToApprove(item);
  if (mode === "approved") return isApprovedForExecution(item);
  if (mode === "done") return isDone(item);
  if (mode === "blocked") return isBlocked(item);
  if (mode === "needs_test") return item.verification_status === "needs_test";
  if (mode === "tested") return item.verification_status === "tested";
  return item.status === mode;
}

export function matchesSearch(item, search) {
  if (!search) return true;
  return `${item.review_ref} ${item.repo} ${item.number} ${item.title} ${item.author} ${item.summary}`
    .toLowerCase()
    .includes(search.toLowerCase().trim());
}

export function reposFor(items = []) {
  const counts = new Map();
  for (const item of items) {
    if (!item.repo) continue;
    counts.set(item.repo, (counts.get(item.repo) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, count]) => ({ repo, count }));
}

// Normalize one raw `reviews` record (already snake_cased by the provider)
// into the review-item shape the UI renders. Ported from
// local-file-provider.ts's normalizeItem(), minus the file-based id
// fallback (a Busabase record always carries its own item_id).
export function normalizeItem(row = {}) {
  const merged = toBool(row.merged) || row.status === "merged";
  const tested = toBool(row.tested);
  return {
    id: row.item_id || "",
    repo: row.repo || "",
    number: Number(row.number || 0),
    title: row.title || "(untitled pull request)",
    author: row.author || "",
    url: row.url || "",
    summary: row.summary || "",
    body: row.body || "",
    status: row.status || "needs_review",
    proposed_action: row.proposed_action || "comment",
    reason: row.reason || "",
    risk: parseJsonList(row.risk),
    labels: parseJsonList(row.labels),
    changed_files: parseJsonList(row.changed_files),
    additions: Number(row.additions || 0),
    deletions: Number(row.deletions || 0),
    comments_count: Number(row.comments_count || 0),
    checks: row.checks || "",
    state: row.state || "",
    merged,
    merged_at: row.merged_at || "",
    verification_status: merged ? (tested ? "tested" : "needs_test") : "",
    tested,
    tested_at: row.tested_at || "",
    test_note: row.test_note || "",
    test_evidence: parseJsonList(row.test_evidence),
    is_draft: toBool(row.is_draft),
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    review_body: row.review_body || "",
    patch_excerpt: row.patch_excerpt || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_detail: row.execution_detail || "",
    __recordId: row.__recordId,
    __headCommitId: row.__headCommitId,
  };
}

// Ported from local-file-provider.ts's withReviewRefs(), adapted for
// Busabase reads that have no guaranteed insertion order: refs are assigned
// by a stable created_at (fallback id) ascending sort so a PR's "Review #N"
// stays put across reloads regardless of the page order records.list returns.
function withReviewRefs(items) {
  const ordered = items
    .slice()
    .sort((a, b) => String(a.created_at || a.id).localeCompare(String(b.created_at || b.id)));
  const refById = new Map(ordered.map((item, index) => [item.id, `Review #${index + 1}`]));
  return items.map((item) => ({ ...item, review_ref: refById.get(item.id) || item.id }));
}

export function buildSnapshot({ records = [] } = {}) {
  const items = withReviewRefs(records.map(normalizeItem)).sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
  );
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-pr-review",
    metrics: countByWorkflow(items),
    items,
    repos: reposFor(items),
  };
}
