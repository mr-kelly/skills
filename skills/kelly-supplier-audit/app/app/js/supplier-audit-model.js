export function scoreSupplierAudit(audits = []) {
  const highRiskSuppliers = audits.filter((a) => a.esgScore < 60 || a.defectPpm > 500);
  const avgEsgScore = audits.reduce((acc, a) => acc + (a.esgScore || 0), 0) / (audits.length || 1);
  return {
    totalSuppliersAudited: audits.length,
    avgEsgScore: Math.round(avgEsgScore),
    highRiskSuppliersCount: highRiskSuppliers.length,
    auditRecommendation: highRiskSuppliers.length > 0 ? "CAP_CORRECTIVE_ACTION_REQUIRED" : "APPROVED_SUPPLIER_LIST",
  };
}
