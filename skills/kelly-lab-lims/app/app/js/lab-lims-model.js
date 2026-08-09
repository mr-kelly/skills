export function calculateLimsEfficiency(samples = []) {
  const avgTatHours = samples.reduce((acc, s) => acc + (s.turnaroundHours || 0), 0) / (samples.length || 1);
  const qcFailures = samples.filter((s) => s.qcResult === "FAIL").length;
  const statPending = samples.filter((s) => s.priority === "STAT" && s.status !== "COMPLETED").length;
  return {
    totalSamples: samples.length,
    avgTatHours: Math.round(avgTatHours * 10) / 10,
    qcFailures,
    statPending,
    cliaQualityIndex: Math.max(0, 100 - qcFailures * 10 - (avgTatHours > 24 ? 15 : 0)),
  };
}
