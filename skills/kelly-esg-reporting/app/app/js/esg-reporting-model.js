export function calculateEsgFootprint(emissions = []) {
  const scope1 = emissions.reduce((acc, e) => acc + (e.scope1Co2Tons || 0), 0);
  const scope2 = emissions.reduce((acc, e) => acc + (e.scope2Co2Tons || 0), 0);
  const scope3 = emissions.reduce((acc, e) => acc + (e.scope3Co2Tons || 0), 0);
  const totalCo2 = scope1 + scope2 + scope3;
  return {
    scope1Tons: Math.round(scope1),
    scope2Tons: Math.round(scope2),
    scope3Tons: Math.round(scope3),
    totalCo2EmissionsTons: Math.round(totalCo2),
    auditStatus: "ESG_DISCLOSURE_READY",
  };
}
