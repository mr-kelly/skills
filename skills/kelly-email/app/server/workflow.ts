import type { ReviewItem } from "./types.ts";

export function decisionAction(item: ReviewItem) {
  return item.decision?.action || "";
}

export function executionStatus(item: ReviewItem) {
  return item.execution?.status || "";
}

export function isExecuted(item: ReviewItem) {
  return item.status === "executed" || executionStatus(item) === "executed";
}

export function isBlocked(item: ReviewItem) {
  return executionStatus(item) === "blocked";
}

export function isDone(item: ReviewItem) {
  return isExecuted(item) || decisionAction(item) === "no_action";
}

export function isDraftAwaitingSendReview(item: ReviewItem) {
  return item.status === "drafted" && !decisionAction(item) && !isExecuted(item) && !isBlocked(item);
}

export function isApprovedForExecution(item: ReviewItem) {
  const action = decisionAction(item);
  if (action === "draft_reply") {
    return item.status === "draft_requested" && !isExecuted(item) && !isBlocked(item);
  }
  if (["archive", "mark_read", "send_reply"].includes(action)) {
    return !isExecuted(item) && !isBlocked(item);
  }
  return isToApprove(item);
}

export function isNeedsReview(item: ReviewItem) {
  return (
    !isDone(item) &&
    !isBlocked(item) &&
    (isDraftAwaitingSendReview(item) ||
      item.status === "needs_review" ||
      ["review", "needs_review", "revise"].includes(decisionAction(item)))
  );
}

export function isToApprove(item: ReviewItem) {
  return (
    !isDone(item) && !isBlocked(item) && !isNeedsReview(item) && !decisionAction(item) && item.status === "prepared"
  );
}

export function approvedPriority(item: ReviewItem) {
  const action = decisionAction(item);
  if (action === "send_reply") return 0;
  if (action === "draft_reply" || item.status === "draft_requested") return 1;
  if (action === "archive" || action === "mark_read") return 2;
  if (item.status === "prepared") return 3;
  return 4;
}
