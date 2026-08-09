export function evaluateSuccessionBench(executives = []) {
  const readyNowSuccessors = executives.filter((e) => e.benchReadiness === "READY_NOW").length;
  const highRiskVacancies = executives.filter((e) => e.flightRisk === "HIGH" && readyNowSuccessors === 0).length;
  return {
    totalExecutiveRoles: executives.length,
    readyNowSuccessorsCount: readyNowSuccessors,
    highRiskVacanciesCount: highRiskVacancies,
    benchStrengthIndexPct: executives.length > 0 ? Math.round((readyNowSuccessors / executives.length) * 100) : 0,
  };
}
