export function computeLboMetrics(deal = {}) {
  const entryEv = (deal.entryMultiple || 10) * (deal.ebitda || 10);
  const debtEquityRatio = (deal.debtPct || 60) / 100;
  const debtAmount = entryEv * debtEquityRatio;
  const equitySponsor = entryEv - debtAmount;
  const exitEv = (deal.exitMultiple || 10) * (deal.exitEbitda || deal.ebitda * 1.5 || 15);
  const exitEquity = exitEv - Math.max(0, debtAmount - (deal.debtPaidDown || debtAmount * 0.5));
  const moic = exitEquity / (equitySponsor || 1);
  return {
    dealName: deal.companyName || "Target Co",
    entryEvMillions: Math.round(entryEv * 10) / 10,
    sponsorEquityMillions: Math.round(equitySponsor * 10) / 10,
    exitMoic: Math.round(moic * 100) / 100,
    underwritingResult: moic >= 2.5 ? "TARGET_IRR_ACHIEVED" : "BELOW_HURDLE_RATE",
  };
}
