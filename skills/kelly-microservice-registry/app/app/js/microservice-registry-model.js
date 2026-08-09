export function auditServiceRegistry(services = []) {
  const missingOwner = services.filter((s) => !s.ownerTeam).length;
  const missingSlo = services.filter((s) => s.tier === 1 && !s.hasDefinedSlo).length;
  return {
    totalMicroservices: services.length,
    unownedServicesCount: missingOwner,
    tier1MissingSloCount: missingSlo,
    catalogHealthScore:
      services.length > 0 ? Math.round(((services.length - missingOwner - missingSlo) / services.length) * 100) : 100,
  };
}
