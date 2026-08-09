export function calculateFundNav(fundData = {}) {
  const grossAssets = fundData.portfolioMarketValue + (fundData.cashBalance || 0);
  const netAssets = grossAssets - (fundData.liabilities || 0) - (fundData.accruedFees || 0);
  const navPerShare = fundData.sharesOutstanding > 0 ? netAssets / fundData.sharesOutstanding : 0;
  return {
    fundName: fundData.name || "Global Macro Fund",
    totalNetAssets: Math.round(netAssets),
    navPerShare: Math.round(navPerShare * 10000) / 10000,
    accruedManagementFee: Math.round(fundData.accruedFees || 0),
    navStatus: "DAILY_NAV_CALCULATED",
  };
}
