export function auditThermalExcursions(shipments = []) {
  const breached = shipments.filter((s) => s.maxTemp > s.allowedMaxTemp || s.minTemp < s.allowedMinTemp);
  const totalSpoilageLoss = breached.reduce((acc, s) => acc + (s.cargoValue || 0), 0);
  return {
    totalColdShipments: shipments.length,
    excursionIncidents: breached.length,
    totalSpoilageRiskValue: Math.round(totalSpoilageLoss),
    qualityCompliancePct:
      shipments.length > 0 ? Math.round(((shipments.length - breached.length) / shipments.length) * 100) : 100,
  };
}
