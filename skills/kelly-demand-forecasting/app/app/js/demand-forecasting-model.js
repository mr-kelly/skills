export function evaluateDemandForecast(skus = []) {
  const avgMape = skus.reduce((acc, s) => acc + (s.mapeError || 0), 0) / (skus.length || 1);
  const stockoutRiskSkus = skus.filter((s) => s.currentStock < s.safetyStockLevel);
  return {
    totalSkusPlanned: skus.length,
    meanAbsolutePercentError: Math.round(avgMape * 10) / 10,
    stockoutRiskCount: stockoutRiskSkus.length,
    forecastAccuracyPct: Math.max(0, Math.round((100 - avgMape) * 10) / 10),
  };
}
