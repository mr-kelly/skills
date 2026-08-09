export function computeTrialMetrics(trials = []) {
  const totalSubjects = trials.reduce((acc, t) => acc + (t.subjectsEnrolled || 0), 0);
  const targetSubjects = trials.reduce((acc, t) => acc + (t.targetSubjects || 100), 0);
  const recruitmentRate = targetSubjects > 0 ? (totalSubjects / targetSubjects) * 100 : 0;
  const deviations = trials.reduce((acc, t) => acc + (t.protocolDeviations || 0), 0);
  return {
    totalTrials: trials.length,
    totalSubjects,
    recruitmentRate: Math.round(recruitmentRate * 10) / 10,
    protocolDeviations: deviations,
    irbStatus: deviations > 5 ? "WARNING_IRB_AUDIT_REQUIRED" : "COMPLIANT",
  };
}
