export function processGlobalPayroll(payrolls = []) {
  const totalGrossPay = payrolls.reduce((acc, p) => acc + (p.grossPayUsd || 0), 0);
  const totalTaxWithheld = payrolls.reduce((acc, p) => acc + (p.taxWithheldUsd || 0), 0);
  const pendingDisbursements = payrolls.filter((p) => p.status === "PENDING_FUNDING").length;
  return {
    totalEntitiesProcessed: payrolls.length,
    totalGrossPayUsd: Math.round(totalGrossPay),
    totalTaxWithheldUsd: Math.round(totalTaxWithheld),
    pendingDisbursements,
    payrollStatus: pendingDisbursements > 0 ? "AWAITING_TREASURY_FUNDING" : "PAYROLL_EXECUTED",
  };
}
