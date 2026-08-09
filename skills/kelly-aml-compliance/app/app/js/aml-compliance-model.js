export function monitorAmlTransactions(txs = []) {
  const suspiciousCount = txs.filter((t) => t.amount >= 10000 || t.isPepMatch || t.isStructuring).length;
  const highRiskValue = txs.filter((t) => t.isPepMatch).reduce((acc, t) => acc + (t.amount || 0), 0);
  return {
    totalTxsMonitored: txs.length,
    suspiciousFlags: suspiciousCount,
    pepExposureAmount: Math.round(highRiskValue),
    sarFilingRequired: suspiciousCount > 0,
    riskRating: suspiciousCount > 5 ? "CRITICAL_AML_RISK" : suspiciousCount > 0 ? "ELEVATED_MONITORING" : "LOW_RISK",
  };
}
