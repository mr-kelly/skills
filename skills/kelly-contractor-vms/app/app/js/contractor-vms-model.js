export function auditContingentWorkforce(contractors = []) {
  const tenureViolations = contractors.filter((c) => c.tenureMonths > 18).length;
  const totalWeeklyBillable = contractors.reduce((acc, c) => acc + (c.hourlyRate * c.weeklyHours || 0), 0);
  return {
    totalContractorsActive: contractors.length,
    tenureOverLimitCount: tenureViolations,
    weeklySpendUsd: Math.round(totalWeeklyBillable),
    coEmploymentRisk: tenureViolations > 0 ? "HIGH_TENURE_RISK" : "COMPLIANT",
  };
}
