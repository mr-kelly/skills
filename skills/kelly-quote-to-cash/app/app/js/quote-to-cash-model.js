export function evaluateDealApprovals(deals = []) {
  const nonStandardDiscount = deals.filter((d) => d.discountPct > 20);
  const totalContractValue = deals.reduce((acc, d) => acc + (d.tcvAmount || 0), 0);
  return {
    totalDealsInQueue: deals.length,
    totalTcvUsd: Math.round(totalContractValue),
    nonStandardDiscountCount: nonStandardDiscount.length,
    approvalRouting: nonStandardDiscount.length > 0 ? "VP_FINANCE_APPROVAL_REQUIRED" : "AUTO_APPROVED",
  };
}
