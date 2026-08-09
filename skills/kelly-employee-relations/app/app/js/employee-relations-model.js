export function auditErInvestigations(cases = []) {
  const openCases = cases.filter((c) => c.status === "OPEN" || c.status === "UNDER_INVESTIGATION");
  const overdueCases = openCases.filter((c) => c.daysOpen > 30).length;
  return {
    totalErCases: cases.length,
    activeInvestigationsCount: openCases.length,
    overdueInvestigationsCount: overdueCases,
    resolutionSlaStatus: overdueCases > 0 ? "SLA_BREACH_ALERT" : "ON_SCHEDULE",
  };
}
