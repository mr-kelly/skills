export function evaluateRegulatoryChanges(rules = []) {
  const highImpact = rules.filter((r) => r.impactLevel === "HIGH" && !r.isImplemented);
  const totalGaps = highImpact.length;
  return {
    totalRegulatoryRulesMonitored: rules.length,
    highImpactGapsCount: totalGaps,
    complianceStatus: totalGaps > 0 ? "ACTION_REQUIRED_REGULATORY_GAPS" : "COMPLIANT",
  };
}
