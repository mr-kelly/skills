export function auditFreightShipments(shipments = []) {
  const delayedShipments = shipments.filter((s) => s.isDelayed).length;
  const customsHold = shipments.filter((s) => s.customsStatus === "HOLD").length;
  const totalSpend = shipments.reduce((acc, s) => acc + (s.freightCost || 0), 0);
  return {
    totalShipments: shipments.length,
    delayedShipments,
    customsHold,
    totalFreightSpend: Math.round(totalSpend),
    otdRatePct:
      shipments.length > 0 ? Math.round(((shipments.length - delayedShipments) / shipments.length) * 100) : 100,
  };
}
