export function trackKolCampaignRoas(campaigns = []) {
  const totalSpend = campaigns.reduce((acc, c) => acc + (c.feeUsd || 0), 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.attributedRevenueUsd || 0), 0);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  return {
    totalKolCampaigns: campaigns.length,
    totalKolSpendUsd: Math.round(totalSpend),
    attributedRevenueUsd: Math.round(totalRevenue),
    blendedRoasMultiple: Math.round(blendedRoas * 100) / 100,
    roasVerdict: blendedRoas >= 3.0 ? "HIGH_PERFORMING_CAMPAIGN" : "UNDERPERFORMING_ROAS",
  };
}
