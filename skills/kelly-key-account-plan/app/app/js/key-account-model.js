export function evaluateAccountPlan(account = {}) {
  const stakeholders = account.stakeholders || [];
  const champions = stakeholders.filter((s) => s.role === "CHAMPION").length;
  const whitespaceOpportunity = account.whitespaceValueUsd || 0;
  return {
    accountName: account.name || "Global Enterprise Customer",
    executiveChampionsCount: champions,
    whitespacePotentialUsd: Math.round(whitespaceOpportunity),
    accountHealth: champions > 0 ? "STRONG_EXECUTIVE_ALIGNMENT" : "CHAMPION_RISK",
  };
}
