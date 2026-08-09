export function processRmaQueue(rmaList = []) {
  const fraudAlerts = rmaList.filter((r) => r.serialMismatch || r.isFraudFlagged).length;
  const restockable = rmaList.filter((r) => r.grade === "GRADE_A" || r.grade === "NEW").length;
  const totalRefundAmount = rmaList.reduce((acc, r) => acc + (r.refundValue || 0), 0);
  return {
    totalRmas: rmaList.length,
    fraudAlertsCount: fraudAlerts,
    restockableCount: restockable,
    totalRefundValue: Math.round(totalRefundAmount),
    rmaRecoveryRatePct: rmaList.length > 0 ? Math.round((restockable / rmaList.length) * 100) : 0,
  };
}
