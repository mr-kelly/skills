export const WORKFLOW_STATUSES = ["needs_review", "to_approve", "approved", "done", "blocked"];

export function isNeedsReview(item) {
  return item.status === "needs_review";
}

export function isToApprove(item) {
  return item.status === "to_approve";
}

export function isApprovedForExecution(item) {
  return item.status === "approved" || Boolean(item.decision?.approved_for_execution);
}

export function isDone(item) {
  return item.status === "done" || item.execution?.status === "executed";
}

export function isBlocked(item) {
  return item.status === "blocked" || item.decision?.action === "block";
}
