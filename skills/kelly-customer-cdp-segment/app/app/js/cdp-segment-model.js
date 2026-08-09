export function evaluateCdpAudiences(segments = []) {
  const totalAudienceSize = segments.reduce((acc, s) => acc + (s.userCount || 0), 0);
  const syncedSegments = segments.filter((s) => s.isSyncedToAdChannel).length;
  return {
    totalSegmentsCreated: segments.length,
    totalAudienceUsers: totalAudienceSize,
    syncedSegmentsCount: syncedSegments,
    cdpActivationPct: segments.length > 0 ? Math.round((syncedSegments / segments.length) * 100) : 0,
  };
}
