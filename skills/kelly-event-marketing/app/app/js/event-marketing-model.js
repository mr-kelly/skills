export function evaluateEventRoi(event = {}) {
  const cost = event.totalSponsorshipCostUsd || 50000;
  const leadsScanned = event.badgeScansCount || 0;
  const pipelineGenerated = event.pipelineSourcedUsd || 0;
  const costPerLead = leadsScanned > 0 ? cost / leadsScanned : 0;
  const eventRoi = cost > 0 ? pipelineGenerated / cost : 0;
  return {
    eventName: event.name || "Global Tech Summit",
    badgeScansCount: leadsScanned,
    costPerLeadUsd: Math.round(costPerLead),
    pipelineGeneratedUsd: Math.round(pipelineGenerated),
    eventRoiMultiple: Math.round(eventRoi * 10) / 10,
  };
}
