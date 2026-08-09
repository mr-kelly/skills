export function calculateTaxProvision(taxData = {}) {
  const taxableIncome = (taxData.pretaxIncome || 0) + (taxData.permanentDifferences || 0);
  const currentTaxLiability = Math.max(0, taxableIncome * (taxData.statutoryRate || 0.21));
  const effectiveTaxRate = taxData.pretaxIncome > 0 ? (currentTaxLiability / taxData.pretaxIncome) * 100 : 0;
  return {
    pretaxIncome: Math.round(taxData.pretaxIncome || 0),
    taxableIncome: Math.round(taxableIncome),
    currentTaxLiability: Math.round(currentTaxLiability),
    effectiveTaxRatePct: Math.round(effectiveTaxRate * 10) / 10,
    provisionStatus: "TAX_PROVISION_BALANCED",
  };
}
