export function decisionAction(item) {
  return (item.decision || {}).action || "";
}

export function executionStatus(item) {
  return (item.execution || {}).status || "";
}

export function isExecuted(item) {
  return item.status === "executed" || executionStatus(item) === "executed";
}

export function isBlocked(item) {
  return executionStatus(item) === "blocked";
}

export function isDone(item) {
  return isExecuted(item) || decisionAction(item) === "no_action";
}

export function isApprovedForExecution(item) {
  const action = decisionAction(item);
  if (action === "draft_reply") {
    return item.status === "draft_requested" && !isExecuted(item) && !isBlocked(item);
  }
  return ["archive", "mark_read", "send_reply"].includes(action) && !isExecuted(item) && !isBlocked(item);
}

export function isNeedsReview(item) {
  return (
    !isDone(item) &&
    !isBlocked(item) &&
    (item.status === "needs_review" || ["review", "needs_review", "revise"].includes(decisionAction(item)))
  );
}

export function isToApprove(item) {
  if (item.status === "drafted") {
    return !isDone(item) && !isBlocked(item) && decisionAction(item) !== "send_reply";
  }
  return !isDone(item) && !isBlocked(item) && !decisionAction(item) && item.status === "prepared";
}
