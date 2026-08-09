export function processDsarQueue(requests = []) {
  const verified = requests.filter((r) => r.identityVerified);
  const overdueErasures = requests.filter((r) => r.daysOpen > 30 && r.status !== "COMPLETED").length;
  return {
    totalRequestsReceived: requests.length,
    identityVerifiedCount: verified.length,
    overdueErasuresCount: overdueErasures,
    dsarSlaStatus: overdueErasures > 0 ? "GDPR_30_DAY_SLA_BREACH" : "DSAR_SLA_COMPLIANT",
  };
}
