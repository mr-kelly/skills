export function aggregateThreatFeeds(iocs = []) {
  const highConfidenceIocs = iocs.filter((i) => i.confidenceScore >= 80);
  return {
    totalIocsIngested: iocs.length,
    highConfidenceCount: highConfidenceIocs.length,
    threatLevel: highConfidenceIocs.length > 10 ? "ELEVATED_GLOBAL_THREAT" : "STANDARD_WATCH",
  };
}
