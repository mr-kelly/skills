export function evaluatePartnerDeals(dealRegs = []) {
  const conflicts = dealRegs.filter((d) => d.hasDirectSalesConflict).length;
  const approved = dealRegs.filter((d) => !d.hasDirectSalesConflict && d.marginTierEligible).length;
  return {
    totalDealRegistrations: dealRegs.length,
    directConflictAlerts: conflicts,
    approvedPartnerDeals: approved,
    channelStatus: conflicts > 0 ? "TERRITORY_CONFLICT_HOLD" : "DEALS_APPROVED",
  };
}
