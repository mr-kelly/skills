export function evaluateOpenEnrollment(enrollments = []) {
  const completed = enrollments.filter((e) => e.isCompleted).length;
  const totalEmployerContribution = enrollments.reduce((acc, e) => acc + (e.employerMonthlyCost || 0), 0);
  return {
    totalEligibleEmployees: enrollments.length,
    completedEnrollmentsCount: completed,
    totalMonthlyEmployerSpendUsd: Math.round(totalEmployerContribution),
    enrollmentCompletionPct: enrollments.length > 0 ? Math.round((completed / enrollments.length) * 100) : 100,
  };
}
