export function monitorTrademarks(trademarks = []) {
  const renewalsDue = trademarks.filter((t) => t.daysToRenewal <= 90 && t.daysToRenewal >= 0).length;
  const activeOppositions = trademarks.filter((t) => t.hasActiveOpposition).length;
  return {
    totalTrademarksTracked: trademarks.length,
    renewalsDueIn90Days: renewalsDue,
    activeOppositions,
    portfolioStatus: renewalsDue > 0 ? "RENEWALS_PENDING" : "PORTFOLIO_UP_TO_DATE",
  };
}
