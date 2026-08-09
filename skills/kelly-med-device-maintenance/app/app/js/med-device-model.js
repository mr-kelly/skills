export function evaluateDeviceCalibration(devices = []) {
  const overdueCalibration = devices.filter((d) => d.daysSinceCalibration > 365 || d.calibrationStatus === "OVERDUE");
  const criticalEquipment = devices.filter((d) => d.isLifeSupport && overdueCalibration.includes(d));
  return {
    totalDevices: devices.length,
    overdueCount: overdueCalibration.length,
    criticalOverdueCount: criticalEquipment.length,
    fdaAuditRisk:
      criticalEquipment.length > 0 ? "HIGH_FDA_WARNING" : overdueCalibration.length > 0 ? "MEDIUM_RISK" : "LOW_RISK",
  };
}
