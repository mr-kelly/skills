export function testPromptRegression(evals = []) {
  const regressed = evals.filter((e) => e.accuracyScore < e.baselineAccuracy);
  const avgCostPer1kTokens = evals.reduce((acc, e) => acc + (e.costPer1k || 0), 0) / (evals.length || 1);
  return {
    totalPromptTests: evals.length,
    regressedCount: regressed.length,
    avgCostPer1k: Math.round(avgCostPer1kTokens * 10000) / 10000,
    promptVerdict: regressed.length > 0 ? "REGRESSION_FAILED_DO_NOT_PROMOTE" : "PASSED_PROMPT_EVAL",
  };
}
