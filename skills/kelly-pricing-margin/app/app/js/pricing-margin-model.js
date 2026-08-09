export function optimizePricingMargin(products = []) {
  const lowMarginSkus = products.filter((p) => p.grossMarginPct < 30);
  const avgMargin = products.reduce((acc, p) => acc + (p.grossMarginPct || 0), 0) / (products.length || 1);
  return {
    totalSkusAnalyzed: products.length,
    avgGrossMarginPct: Math.round(avgMargin * 10) / 10,
    lowMarginAlertsCount: lowMarginSkus.length,
    pricingStrategy: lowMarginSkus.length > 0 ? "MARGIN_RECOVERY_REQUIRED" : "MARGINS_OPTIMIZED",
  };
}
