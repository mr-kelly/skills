export function aggregateCustomerFeedback(feedbackList = []) {
  const highImpactRequests = feedbackList.filter((f) => f.arrImpactUsd >= 50000);
  const totalArrImpact = highImpactRequests.reduce((acc, f) => acc + (f.arrImpactUsd || 0), 0);
  return {
    totalFeedbackItems: feedbackList.length,
    highImpactRequestsCount: highImpactRequests.length,
    totalArrAtRiskUsd: Math.round(totalArrImpact),
    roadmapPriority: highImpactRequests.length > 0 ? "P0_ROADMAP_EPIC_CREATED" : "STANDARD_BACKLOG",
  };
}
