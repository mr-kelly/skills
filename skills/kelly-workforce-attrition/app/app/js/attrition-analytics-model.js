export function predictTeamAttrition(employees = []) {
  const highFlightRisk = employees.filter(
    (e) => e.tenureMonths > 12 && e.lastPromotionMonths > 24 && e.engagementScore < 60,
  );
  const turnoverRate = employees.length > 0 ? (highFlightRisk.length / employees.length) * 100 : 0;
  return {
    totalEmployeesAnalyzed: employees.length,
    flightRiskCount: highFlightRisk.length,
    predictedTurnoverRatePct: Math.round(turnoverRate * 10) / 10,
    retentionRiskLevel: turnoverRate > 15 ? "CRITICAL_ATTRITION_WARNING" : "STABLE_TENURE",
  };
}
