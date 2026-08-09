export function auditAppStorePerformance(appStats = {}) {
  const avgRating = appStats.avgStarRating || 4.5;
  const negativeReviews = appStats.negativeReviews1And2Star || 0;
  return {
    appName: appStats.appName || "Kelly Mobile App",
    averageRating: Math.round(avgRating * 10) / 10,
    negativeReviews1And2Star: negativeReviews,
    asoHealthStatus: avgRating >= 4.2 ? "HIGH_APP_STORE_RATING" : "ATTENTION_RATING_DROP",
  };
}
