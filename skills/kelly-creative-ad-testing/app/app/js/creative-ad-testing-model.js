export function evaluateAdVariants(variants = []) {
  const winningVariants = variants.filter((v) => v.ctrPct >= 2.5 && v.roas >= 3.0);
  return {
    totalVariantsTested: variants.length,
    winningVariantsCount: winningVariants.length,
    testingStatus: winningVariants.length > 0 ? "WINNER_VARIANTS_SCALED" : "CONTINUE_CREATIVE_TESTING",
  };
}
