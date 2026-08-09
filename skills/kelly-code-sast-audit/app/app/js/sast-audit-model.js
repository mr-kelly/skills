export function runSastScan(repos = []) {
  const totalFindings = repos.reduce((acc, r) => acc + (r.findingCount || 0), 0);
  const criticalSqlInjections = repos.reduce((acc, r) => acc + (r.sqlInjectionCount || 0), 0);
  return {
    totalReposAudited: repos.length,
    totalVulnerabilities: totalFindings,
    sqlInjectionFindings: criticalSqlInjections,
    securityGateStatus: criticalSqlInjections > 0 ? "BUILD_FAILED_CRITICAL_SAST" : "PASSED_SAST_GATE",
  };
}
