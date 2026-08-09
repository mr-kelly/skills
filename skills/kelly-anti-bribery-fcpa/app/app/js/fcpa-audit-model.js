export function auditFcpaVetting(vendors = []) {
  const highRiskIntermediaries = vendors.filter((v) => v.interactsWithGovtOfficials && !v.hasSignedAntiBriberyCert);
  return {
    totalIntermediariesVetted: vendors.length,
    fcpaHighRiskCount: highRiskIntermediaries.length,
    vettingVerdict: highRiskIntermediaries.length > 0 ? "HIGH_FCPA_RISK_HOLD" : "APPROVED_INTERMEDIARIES",
  };
}
