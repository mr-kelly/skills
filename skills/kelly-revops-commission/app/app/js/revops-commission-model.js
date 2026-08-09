export function calculateCommissions(reps = []) {
  let totalPayout = 0;
  reps.forEach((r) => {
    const attainment = r.quota > 0 ? (r.closedRevenue / r.quota) * 100 : 0;
    const rate = attainment > 100 ? 0.15 : 0.1;
    totalPayout += r.closedRevenue * rate;
  });
  return {
    totalRepsProcessed: reps.length,
    totalCommissionPayoutUsd: Math.round(totalPayout),
    payoutStatus: "COMMISSIONS_CALCULATED",
  };
}
