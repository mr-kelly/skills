export function auditLmsCertifications(courses = []) {
  const overdueCount = courses.filter((c) => c.isMandatory && !c.isCompleted && c.isPastDue).length;
  const totalCompleted = courses.filter((c) => c.isCompleted).length;
  const completionRate = courses.length > 0 ? (totalCompleted / courses.length) * 100 : 100;
  return {
    totalAssignedCourses: courses.length,
    completedCourses: totalCompleted,
    overdueMandatoryCourses: overdueCount,
    complianceCompletionPct: Math.round(completionRate * 10) / 10,
  };
}
