export function evaluateSoarPlaybook(incidents = []) {
  const autoContained = incidents.filter((i) => i.isAutoMitigated).length;
  const pendingManualBlock = incidents.filter((i) => !i.isAutoMitigated && i.severity === "CRITICAL").length;
  return {
    totalIncidentsInjected: incidents.length,
    autoContainedCount: autoContained,
    pendingManualBlock,
    soarEfficiencyPct: incidents.length > 0 ? Math.round((autoContained / incidents.length) * 100) : 100,
  };
}
