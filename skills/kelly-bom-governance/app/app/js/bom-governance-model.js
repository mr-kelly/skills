export function auditBomRisk(bomList = []) {
  const singleSourceComponents = bomList.filter((b) => b.isSingleSource).length;
  const pendingEcos = bomList.filter((b) => b.hasPendingEco).length;
  const totalCost = bomList.reduce((acc, b) => acc + (b.unitCost * b.quantity || 0), 0);
  return {
    totalBomsAudited: bomList.length,
    totalBomsCost: Math.round(totalCost * 100) / 100,
    singleSourceRiskCount: singleSourceComponents,
    pendingEcoCount: pendingEcos,
    resilienceScore: Math.max(0, 100 - singleSourceComponents * 15 - pendingEcos * 5),
  };
}
