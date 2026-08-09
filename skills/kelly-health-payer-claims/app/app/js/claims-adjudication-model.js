export function adjudicateClaimBatch(claims = []) {
  let totalBilled = 0;
  let totalApproved = 0;
  let deniedCount = 0;
  claims.forEach((c) => {
    totalBilled += c.billedAmount || 0;
    if (c.hasPriorAuth && c.icd10Match) {
      totalApproved += (c.billedAmount || 0) * (c.coverageRatio || 0.8);
    } else {
      deniedCount++;
    }
  });
  return {
    claimsProcessed: claims.length,
    totalBilledAmount: Math.round(totalBilled),
    totalApprovedAmount: Math.round(totalApproved),
    deniedCount,
    denialRate: claims.length > 0 ? Math.round((deniedCount / claims.length) * 1000) / 10 : 0,
  };
}
