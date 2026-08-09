export function screenExportTransaction(order = {}) {
  const isSanctionedCountry = ["CUBA", "IRAN", "NORTH_KOREA", "SYRIA"].includes(
    (order.destinationCountry || "").toUpperCase(),
  );
  const isDeniedPartyMatch = order.isDeniedPartyMatch || false;
  const requiresLicense = isSanctionedCountry || isDeniedPartyMatch || order.eccnCode !== "EAR99";
  return {
    orderId: order.id || "ORD-9901",
    isSanctionedCountry,
    isDeniedPartyMatch,
    exportLicenseRequired: requiresLicense,
    complianceVerdict: requiresLicense ? "BLOCKED_PENDING_BIS_LICENSE" : "PASSED_TRADE_SCREENING",
  };
}
