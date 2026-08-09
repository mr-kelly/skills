export function adjustInsuranceClaim(claim = {}) {
  const assessedDamage = claim.assessedDamage || 0;
  const deductible = claim.deductible || 5000;
  const policyLimit = claim.policyLimit || 1000000;
  const payableLoss = Math.min(policyLimit, Math.max(0, assessedDamage - deductible));
  return {
    claimId: claim.claimId || "CLM-9901",
    assessedDamage: Math.round(assessedDamage),
    appliedDeductible: Math.round(deductible),
    approvedPayout: Math.round(payableLoss),
    claimStatus: payableLoss > 50000 ? "REQUIRES_SENIOR_ADJUSTER_APPROVAL" : "APPROVED_FOR_PAYMENT",
  };
}
