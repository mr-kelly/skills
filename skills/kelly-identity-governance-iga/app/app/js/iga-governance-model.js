export function auditAccessCertification(certifications = []) {
  const pendingRevokes = certifications.filter((c) => c.decision === "REVOKE" && !c.isExecuted).length;
  const sodViolations = certifications.filter((c) => c.hasSodConflict).length;
  return {
    totalCertifications: certifications.length,
    pendingRevokeActions: pendingRevokes,
    sodViolationsCount: sodViolations,
    auditCompletionPct:
      certifications.length > 0
        ? Math.round(((certifications.length - pendingRevokes) / certifications.length) * 100)
        : 100,
  };
}
