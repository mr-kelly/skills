export function evaluateFleetHealth(vehicles = []) {
  const activeDtcFaults = vehicles.filter((v) => v.hasDtcFault).length;
  const lowSafetyScore = vehicles.filter((v) => v.driverSafetyScore < 70).length;
  const avgMpg = vehicles.reduce((acc, v) => acc + (v.fuelMpg || 0), 0) / (vehicles.length || 1);
  return {
    totalFleetVehicles: vehicles.length,
    activeFaults: activeDtcFaults,
    riskyDrivers: lowSafetyScore,
    avgFuelEconomyMpg: Math.round(avgMpg * 10) / 10,
    fleetStatus: activeDtcFaults > 2 ? "MAINTENANCE_REQUIRED" : "FLEET_OPERATIONAL",
  };
}
