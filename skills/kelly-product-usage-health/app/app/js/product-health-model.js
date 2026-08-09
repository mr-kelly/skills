export function evaluatePlgHealth(accounts = []) {
  const healthyAccounts = accounts.filter((a) => a.dauMauRatio >= 0.4 && a.licenseUtilization >= 80);
  const expansionCandidates = accounts.filter((a) => a.licenseUtilization >= 95);
  return {
    totalAccountsMonitored: accounts.length,
    healthyAccountsCount: healthyAccounts.length,
    expansionCandidatesCount: expansionCandidates.length,
    plgHealthIndexPct: accounts.length > 0 ? Math.round((healthyAccounts.length / accounts.length) * 100) : 0,
  };
}
