export function calculateSpcMetrics(inspections = []) {
  const totalScrap = inspections.reduce((acc, i) => acc + (i.scrapUnits || 0), 0);
  const totalProduced = inspections.reduce((acc, i) => acc + (i.totalUnits || 1000), 0);
  const firstPassYield = totalProduced > 0 ? ((totalProduced - totalScrap) / totalProduced) * 100 : 100;
  const outOfControlCpks = inspections.filter((i) => i.cpkIndex < 1.33).length;
  return {
    totalInspections: inspections.length,
    firstPassYieldPct: Math.round(firstPassYield * 10) / 10,
    totalScrapUnits: totalScrap,
    cpkAlerts: outOfControlCpks,
    spcStatus: outOfControlCpks === 0 && firstPassYield > 98 ? "STABLE_PROCESS" : "PROCESS_DRIFT_ALERT",
  };
}
