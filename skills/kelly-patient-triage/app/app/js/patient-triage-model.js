export function evaluateErTriageCapacity(patients = []) {
  const criticalEsi1And2 = patients.filter((p) => p.esiLevel <= 2);
  const bedAssigned = patients.filter((p) => p.bedAssigned).length;
  const avgWaitTimeMinutes = patients.reduce((acc, p) => acc + (p.waitTimeMinutes || 0), 0) / (patients.length || 1);
  return {
    totalTriagePatients: patients.length,
    criticalCount: criticalEsi1And2.length,
    bedUtilizationPct: patients.length > 0 ? Math.round((bedAssigned / patients.length) * 100) : 0,
    avgWaitTimeMinutes: Math.round(avgWaitTimeMinutes),
    erSurgeStatus: criticalEsi1And2.length > 5 || avgWaitTimeMinutes > 60 ? "SURGE_ALERT" : "NORMAL",
  };
}
