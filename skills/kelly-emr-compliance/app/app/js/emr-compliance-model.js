export function auditHipaaAccessLogs(logs = []) {
  const afterHoursAccess = logs.filter((l) => l.accessHour < 6 || l.accessHour > 22).length;
  const vipChartAccess = logs.filter((l) => l.isVipPatient).length;
  const unencryptedTransfers = logs.filter((l) => !l.isEncryptedFhir).length;
  const riskScore = afterHoursAccess * 15 + vipChartAccess * 25 + unencryptedTransfers * 30;
  return {
    totalLogsAudited: logs.length,
    afterHoursAccess,
    vipChartAccess,
    unencryptedTransfers,
    hipaaRiskScore: Math.min(100, riskScore),
    complianceLevel: riskScore < 20 ? "LOW_RISK" : riskScore < 50 ? "MODERATE_RISK" : "CRITICAL_AUDIT",
  };
}
