export function evaluateRfqBids(rfqItems = []) {
  let totalSavings = 0;
  rfqItems.forEach((item) => {
    if (item.winningBid && item.baselineCost) {
      totalSavings += item.baselineCost - item.winningBid;
    }
  });
  const pendingAwards = rfqItems.filter((i) => i.status === "PENDING_APPROVAL").length;
  return {
    totalRfqs: rfqItems.length,
    totalSavingsAchieved: Math.round(totalSavings),
    pendingAwardApprovals: pendingAwards,
    sourcingStatus: pendingAwards > 0 ? "AWAITING_FINANCE_SIGN_OFF" : "RFQS_COMPLETE",
  };
}
