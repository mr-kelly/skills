export function optimizeCloudFinops(instances = []) {
  let totalWastedSpend = 0;
  let totalPotentialSavings = 0;
  instances.forEach((inst) => {
    if (inst.cpuUtilizationAvg < 15) {
      totalWastedSpend += inst.monthlyCost || 0;
      totalPotentialSavings += (inst.monthlyCost || 0) * 0.6;
    }
  });
  return {
    totalInstancesAnalyzed: instances.length,
    idleInstancesCount: instances.filter((i) => i.cpuUtilizationAvg < 15).length,
    monthlyWastedSpendUsd: Math.round(totalWastedSpend),
    potentialMonthlySavingsUsd: Math.round(totalPotentialSavings),
  };
}
