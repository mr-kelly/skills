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
  if (item.status === "drafted" && item.proposed_action === "send_reply" && !isExecuted(item) && !isBlocked(item)) {
    return true;
  }
  if (action === "draft_reply") {
    return item.status === "draft_requested" && !isExecuted(item) && !isBlocked(item);
  }
  if (["archive", "mark_read", "send_reply"].includes(action)) {
    return !isExecuted(item) && !isBlocked(item);
  }
  return isToApprove(item);
}

export function isNeedsReview(item) {
  return (
    !isDone(item) &&
    !isBlocked(item) &&
    (item.status === "needs_review" || ["review", "needs_review", "revise"].includes(decisionAction(item)))
  );
}

export function isToApprove(item) {
  return !isDone(item) && !isBlocked(item) && !isNeedsReview(item) && !decisionAction(item) && ["prepared", "drafted"].includes(item.status);
}
