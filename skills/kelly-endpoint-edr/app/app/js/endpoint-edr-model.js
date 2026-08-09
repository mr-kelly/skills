export function processEdrAlerts(alerts = []) {
  const activeThreats = alerts.filter((a) => a.severity === "CRITICAL" && !a.isIsolated);
  return {
    totalAlerts: alerts.length,
    criticalActiveThreats: activeThreats.length,
    isolationRecommendation: activeThreats.length > 0 ? "ISOLATE_AFFECTED_HOSTS" : "NO_ACTION_NEEDED",
  };
}
