export function auditTerraformPlan(plan = {}) {
  const openSecurityGroups =
    plan.resources?.filter((r) => r.type === "aws_security_group" && r.hasOpenCidr).length || 0;
  const driftedResources = plan.driftedResourceCount || 0;
  return {
    terraformModule: plan.moduleName || "main-vpc",
    openSecurityGroupViolations: openSecurityGroups,
    driftedResourceCount: driftedResources,
    planVerdict:
      openSecurityGroups > 0
        ? "REJECT_SECURITY_RISK"
        : driftedResources > 0
          ? "DRIFT_DETECTED_APPLY_NEEDED"
          : "PLAN_CLEAN",
  };
}
