export function evaluateMdfProposals(requests = []) {
  const approved = requests.filter((r) => r.hasProofOfExecution && r.roiEstimate >= 2.0);
  const totalClaimAmount = approved.reduce((acc, r) => acc + (r.requestedAmountUsd || 0), 0);
  return {
    totalMdfRequests: requests.length,
    approvedCount: approved.length,
    totalReimbursementUsd: Math.round(totalClaimAmount),
    mdfStatus: "MDF_CLAIMS_AUDITED",
  };
}
