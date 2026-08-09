export function auditTelehealthVisits(visits = []) {
  const validConsent = visits.filter((v) => v.hasSignedConsent && v.isCrossStateLicensed);
  const missingConsent = visits.filter((v) => !v.hasSignedConsent).length;
  const licensingGaps = visits.filter((v) => !v.isCrossStateLicensed).length;
  return {
    totalVisits: visits.length,
    compliantVisits: validConsent.length,
    missingConsent,
    licensingGaps,
    compliancePct: visits.length > 0 ? Math.round((validConsent.length / visits.length) * 100) : 100,
  };
}
