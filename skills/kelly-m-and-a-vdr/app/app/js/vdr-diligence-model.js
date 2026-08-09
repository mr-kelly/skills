export function evaluateVdrProgress(findings = []) {
  const redFlags = findings.filter((f) => f.severity === "RED_FLAG").length;
  const verifiedItems = findings.filter((f) => f.isVerified).length;
  return {
    totalDiligenceItems: findings.length,
    redFlagCount: redFlags,
    verifiedCount: verifiedItems,
    diligenceCompletionPct: findings.length > 0 ? Math.round((verifiedItems / findings.length) * 100) : 100,
  };
}
