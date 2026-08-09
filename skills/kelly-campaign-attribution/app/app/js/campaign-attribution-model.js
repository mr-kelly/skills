export function calculateCampaignAttribution(touchpoints = []) {
  const totalCacSpend = touchpoints.reduce((acc, t) => acc + (t.adSpendUsd || 0), 0);
  const totalConversions = touchpoints.reduce((acc, t) => acc + (t.conversionCount || 0), 0);
  const avgCac = totalConversions > 0 ? totalCacSpend / totalConversions : 0;
  return {
    totalTouchpointsAnalyzed: touchpoints.length,
    totalMarketingSpendUsd: Math.round(totalCacSpend),
    totalConversions,
    blendedCacUsd: Math.round(avgCac * 100) / 100,
  };
}
