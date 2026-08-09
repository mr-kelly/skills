export function allocateK8sCosts(pods = []) {
  const totalCpuCost = pods.reduce((acc, p) => acc + (p.cpuRequested * p.cpuHourlyRate || 0), 0);
  const wastedMemoryCost = pods
    .filter((p) => p.memoryRequested > p.memoryUsed * 2)
    .reduce((acc, p) => acc + p.memoryRequested * 0.05, 0);
  return {
    totalPodsAnalyzed: pods.length,
    totalMonthlyCpuCostUsd: Math.round(totalCpuCost * 24 * 30),
    wastedMemorySpendUsd: Math.round(wastedMemoryCost * 24 * 30),
    rightSizingOpportunity: wastedMemoryCost > 10 ? "RIGHT_SIZING_RECOMMENDED" : "OPTIMAL_ALLOCATION",
  };
}
