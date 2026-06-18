import { CURRENT_BATCH_PATH, DECISIONS_PATH, EXECUTION_REPORT_PATH } from "./paths.mjs";
import { loadBatch, normalizeItem } from "./batch-store.mjs";
import { lockPayload } from "./lock.mjs";
import { normalizeQueryValue, readJson } from "./utils.mjs";
import { isApprovedForExecution, isBlocked, isDone, isNeedsReview, isToApprove } from "./workflow.mjs";
import { loadConfigWithMeta } from "../../lib/data-reader/index.mjs";
import { publicConfigSummary } from "../../lib/data-reader/local-file-reader.mjs";

function countByWorkflow(items) {
  return {
    needs_review: items.filter(isNeedsReview).length,
    to_approve: items.filter(isToApprove).length,
    approved: items.filter(isApprovedForExecution).length,
    done: items.filter(isDone).length,
    blocked: items.filter(isBlocked).length,
  };
}

function withReviewRefs(items) {
  return items.map((item, index) => ({
    ...item,
    review_number: index + 1,
    review_ref: item.review_ref || `Review #${index + 1}`,
  }));
}

function matchesMode(item, mode) {
  if (mode === "all") return true;
  if (mode === "needs_review") return isNeedsReview(item);
  if (mode === "to_approve") return isToApprove(item);
  if (mode === "approved") return isApprovedForExecution(item);
  if (mode === "done") return isDone(item);
  if (mode === "blocked") return isBlocked(item);
  return item.status === mode;
}

function reposFor(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item.repo) continue;
    counts.set(item.repo, (counts.get(item.repo) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, count]) => ({ repo, count }));
}

export async function statePayload(query = {}) {
  const batch = await loadBatch();
  const meta = await loadConfigWithMeta();
  const allItems = withReviewRefs((batch.items || []).map(normalizeItem));
  const mode = normalizeQueryValue(query.mode, "all");
  const search = normalizeQueryValue(query.q, "").toLowerCase().trim();
  const repo = normalizeQueryValue(query.repo, "all");
  const repoItems = repo && repo !== "all"
    ? allItems.filter((item) => item.repo === repo)
    : allItems;
  let items = repoItems.filter((item) => matchesMode(item, mode));
  if (search) {
    items = items.filter((item) => `${item.review_ref} ${item.repo} ${item.number} ${item.title} ${item.author} ${item.summary}`.toLowerCase().includes(search));
  }
  items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return {
    app: "kelly-pr-review",
    batch: {
      batch_id: batch.batch_id,
      generated_at: batch.generated_at,
      updated_at: batch.updated_at,
      source: batch.source,
      mode: batch.mode,
      metrics: batch.metrics || countByWorkflow(allItems),
    },
    counts: countByWorkflow(repoItems),
    repos: reposFor(allItems),
    selected_repo: repo || "all",
    items,
    total_cached: repoItems.length,
    total_all_repos: allItems.length,
    batch_path: CURRENT_BATCH_PATH,
    decisions_path: DECISIONS_PATH,
    execution_report_path: EXECUTION_REPORT_PATH,
    config_summary: publicConfigSummary(meta),
    execution_report: await readJson(EXECUTION_REPORT_PATH, {}),
    lock: await lockPayload(),
  };
}
