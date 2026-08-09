export function auditOnboardingProgress(projects = []) {
  const delayedProjects = projects.filter((p) => p.daysInStage > 30 && p.stage !== "LIVE").length;
  const avgTtvDays = projects.reduce((acc, p) => acc + (p.timeToValueDays || 0), 0) / (projects.length || 1);
  return {
    totalProjectsActive: projects.length,
    delayedProjectsCount: delayedProjects,
    avgTtvDays: Math.round(avgTtvDays),
    onboardingHealth: delayedProjects > 2 ? "ONBOARDING_BOTTLENECK_ALERT" : "HEALTHY_ONBOARDING",
  };
}
