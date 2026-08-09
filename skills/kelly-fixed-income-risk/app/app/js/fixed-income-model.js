export function computeBondPortfolioRisk(bonds = []) {
  const totalValue = bonds.reduce((acc, b) => acc + (b.marketValue || 0), 0);
  const weightedDuration =
    bonds.reduce((acc, b) => acc + (b.duration || 0) * (b.marketValue || 0), 0) / (totalValue || 1);
  const junkBondValue = bonds
    .filter((b) => b.creditRating.startsWith("B") || b.creditRating.startsWith("C"))
    .reduce((acc, b) => acc + (b.marketValue || 0), 0);
  return {
    totalPortfolioValue: Math.round(totalValue),
    weightedDurationYears: Math.round(weightedDuration * 100) / 100,
    highYieldPct: totalValue > 0 ? Math.round((junkBondValue / totalValue) * 1000) / 10 : 0,
    interestRateSensitivity: weightedDuration > 7 ? "HIGH_DURATION_RISK" : "MODERATE_DURATION",
  };
}
