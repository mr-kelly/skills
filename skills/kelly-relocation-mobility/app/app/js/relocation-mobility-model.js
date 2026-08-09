export function auditVisaExpirations(relocations = []) {
  const expiringSoon = relocations.filter((r) => r.daysToVisaExpiry <= 60 && r.daysToVisaExpiry >= 0);
  const totalMobilityCost = relocations.reduce((acc, r) => acc + (r.relocationCostUsd || 0), 0);
  return {
    totalExpatsTracked: relocations.length,
    visaExpiringWithin60Days: expiringSoon.length,
    totalMobilitySpendUsd: Math.round(totalMobilityCost),
    complianceStatus: expiringSoon.length > 0 ? "URGENT_VISA_RENEWALS_REQUIRED" : "VISAS_UP_TO_DATE",
  };
}
