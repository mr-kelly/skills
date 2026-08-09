export function evaluateFormularySafety(prescriptions = []) {
  const interactionAlerts = prescriptions.filter((p) => p.hasSevereInteraction).length;
  const nonFormularyRequests = prescriptions.filter((p) => p.isNonFormulary).length;
  const autoSubstituted = prescriptions.filter((p) => p.isTherapeuticSubstitution).length;
  return {
    totalPrescriptions: prescriptions.length,
    interactionAlerts,
    nonFormularyRequests,
    autoSubstituted,
    safetyScore: Math.max(0, 100 - interactionAlerts * 20 - nonFormularyRequests * 5),
  };
}
