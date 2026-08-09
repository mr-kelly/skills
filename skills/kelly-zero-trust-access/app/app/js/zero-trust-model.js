export function auditZtnaAccess(requests = []) {
  const trustedRequests = requests.filter((r) => r.deviceCompliant && r.mfaVerified && !r.isAnomalousLocation);
  const blockedRequests = requests.length - trustedRequests.length;
  return {
    totalAccessRequests: requests.length,
    grantedRequests: trustedRequests.length,
    blockedRequests,
    trustScore: requests.length > 0 ? Math.round((trustedRequests.length / requests.length) * 100) : 100,
  };
}
