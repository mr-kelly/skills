export function reviewDiscoveryBatch(documents = []) {
  const responsive = documents.filter((d) => d.isResponsive);
  const privileged = documents.filter((d) => d.isPrivileged);
  return {
    totalDocumentsReviewed: documents.length,
    responsiveCount: responsive.length,
    privilegedCount: privileged.length,
    reviewProgressPct:
      documents.length > 0 ? Math.round(((responsive.length + privileged.length) / documents.length) * 100) : 100,
  };
}
