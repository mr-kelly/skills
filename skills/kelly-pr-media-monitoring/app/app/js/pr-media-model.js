export function auditMediaCoverage(pressReleases = []) {
  const totalPickups = pressReleases.reduce((acc, pr) => acc + (pr.pickupCount || 0), 0);
  const positiveSentimentPct =
    (pressReleases.reduce((acc, pr) => acc + (pr.positiveSentimentRatio || 0.8), 0) / (pressReleases.length || 1)) *
    100;
  return {
    totalWireReleases: pressReleases.length,
    totalMediaPickups: totalPickups,
    positiveSentimentPct: Math.round(positiveSentimentPct),
    prCampaignImpact: totalPickups > 50 ? "WIDE_MEDIA_COVERAGE" : "STANDARD_REACH",
  };
}
