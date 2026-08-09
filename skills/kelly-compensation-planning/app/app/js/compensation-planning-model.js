export function calculateMeritPool(employees = []) {
  const totalCurrentBase = employees.reduce((acc, e) => acc + (e.currentBaseSalary || 0), 0);
  const totalProposedIncrease = employees.reduce((acc, e) => acc + (e.proposedIncreaseAmount || 0), 0);
  const avgCompaRatio = employees.reduce((acc, e) => acc + (e.compaRatio || 1), 0) / (employees.length || 1);
  return {
    totalEmployeesEligible: employees.length,
    totalBaseSalaryUsd: Math.round(totalCurrentBase),
    proposedMeritIncreaseUsd: Math.round(totalProposedIncrease),
    meritPoolPct: totalCurrentBase > 0 ? Math.round((totalProposedIncrease / totalCurrentBase) * 1000) / 10 : 0,
    avgCompaRatio: Math.round(avgCompaRatio * 100) / 100,
  };
}
