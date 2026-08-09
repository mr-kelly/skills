export function evaluateFxHedging(exposures = []) {
  let unhedgedTotal = 0;
  let hedgedTotal = 0;
  exposures.forEach((e) => {
    if (e.isHedged) {
      hedgedTotal += e.amountUsd || 0;
    } else {
      unhedgedTotal += e.amountUsd || 0;
    }
  });
  const hedgeRatio = hedgedTotal + unhedgedTotal > 0 ? (hedgedTotal / (hedgedTotal + unhedgedTotal)) * 100 : 0;
  return {
    totalFxExposureUsd: Math.round(hedgedTotal + unhedgedTotal),
    hedgedAmountUsd: Math.round(hedgedTotal),
    unhedgedAmountUsd: Math.round(unhedgedTotal),
    hedgeRatioPct: Math.round(hedgeRatio * 10) / 10,
    policyCompliance: hedgeRatio >= 70 ? "COMPLIANT_WITH_TREASURY_POLICY" : "UNDER_HEDGED_ALERT",
  };
}
