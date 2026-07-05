import { loadBatch, normalizeItem } from "./batch-store.ts";
import { loadConfigWithMeta, onboardingStatus, publicAccounts } from "./config.ts";
import { lockPayload } from "./lock.ts";
import { CURRENT_BATCH_PATH, DECISIONS_PATH } from "./paths.ts";
import type { ReviewItem, StateQuery, StatusCounts } from "./types.ts";
import { normalizeQueryValue } from "./utils.ts";
import { approvedPriority, isApprovedForExecution, isBlocked, isDone, isNeedsReview } from "./workflow.ts";

function countByStatus(items: ReviewItem[]): StatusCounts {
  const counts: StatusCounts = {};
  for (const item of items) {
    counts[item.status || "unknown"] = (counts[item.status || "unknown"] || 0) + 1;
  }
  return counts;
}

function uidNumber(item: ReviewItem) {
  return Number.parseInt(item.uid || "0", 10) || 0;
}

function withReviewNumbers(items: ReviewItem[]): ReviewItem[] {
  const reviewItems = items.filter(isNeedsReview).sort((a, b) => uidNumber(b) - uidNumber(a));
  const byId = new Map(reviewItems.map((item, index) => [String(item.id), index + 1]));
  return items.map((item) => {
    const reviewNumber = byId.get(String(item.id)) || null;
    if (!reviewNumber) return { ...item, review_number: null, review_ref: "" };
    return { ...item, review_number: reviewNumber, review_ref: `Review #${reviewNumber}` };
  });
}

export async function statePayload(query: StateQuery = {}) {
  const batch = await loadBatch();
  const configMeta = await loadConfigWithMeta();
  const { config, source } = configMeta;
  const onboarding = onboardingStatus(config, configMeta);
  const allItems = withReviewNumbers((batch.items || []).map(normalizeItem));
  let items = allItems;
  const mode = normalizeQueryValue(query.mode, "all");
  const search = normalizeQueryValue(query.q, "").toLowerCase().trim();
  if (mode !== "all") {
    if (mode === "needs_review") items = items.filter(isNeedsReview);
    else if (mode === "approved") items = items.filter(isApprovedForExecution);
    else if (mode === "done") items = items.filter(isDone);
    else if (mode === "blocked") items = items.filter(isBlocked);
    else items = items.filter((item) => item.status === mode);
  }
  if (search) {
    items = items.filter((item) =>
      `${item.review_ref} ${item.from} ${item.subject} ${item.summary}`.toLowerCase().includes(search),
    );
  }
  items.sort((a, b) => {
    if (mode === "approved") {
      const priority = approvedPriority(a) - approvedPriority(b);
      if (priority) return priority;
    }
    return uidNumber(b) - uidNumber(a);
  });
  const counts = countByStatus(allItems);
  counts.needs_review = allItems.filter(isNeedsReview).length;
  counts.to_approve = 0;
  counts.approved = allItems.filter(isApprovedForExecution).length;
  counts.done = allItems.filter(isDone).length;
  counts.blocked = allItems.filter(isBlocked).length;
  return {
    app: "kelly-email",
    batch: {
      batch_id: batch.batch_id,
      generated_at: batch.generated_at,
      updated_at: batch.updated_at,
      source: batch.source,
      last_scan: batch.last_scan,
    },
    counts,
    items,
    total_cached: allItems.length,
    batch_path: CURRENT_BATCH_PATH,
    decisions_path: DECISIONS_PATH,
    email_accounts: publicAccounts(config, source, onboarding, configMeta),
    lock: await lockPayload(),
  };
}
