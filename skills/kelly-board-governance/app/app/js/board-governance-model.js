export function auditBoardResolutions(resolutions = []) {
  const pendingSignatures = resolutions.filter((r) => r.status === "AWAITING_SIGNATURES").length;
  const executed = resolutions.filter((r) => r.status === "EXECUTED").length;
  return {
    totalResolutionsTracked: resolutions.length,
    executedResolutionsCount: executed,
    pendingDirectorSignatures: pendingSignatures,
    governanceStatus: pendingSignatures > 0 ? "SIGNATURES_PENDING" : "BOARD_RECORDS_COMPLETE",
  };
}
