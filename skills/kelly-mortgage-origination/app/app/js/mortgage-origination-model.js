export function auditMortgageApplication(loan = {}) {
  const ltv = loan.appraisedValue > 0 ? (loan.loanAmount / loan.appraisedValue) * 100 : 100;
  const dti = loan.monthlyIncome > 0 ? (loan.monthlyDebt / loan.monthlyIncome) * 100 : 100;
  const eligibleFannieMae = ltv <= 80 && dti <= 43 && loan.creditScore >= 620;
  return {
    borrowerName: loan.borrowerName || "Mortgage Applicant",
    ltvPct: Math.round(ltv * 10) / 10,
    dtiPct: Math.round(dti * 10) / 10,
    creditScore: loan.creditScore || 700,
    conformingEligibility: eligibleFannieMae ? "CONFORMING_QUALIFIED" : "MANUAL_UNDERWRITE_REQUIRED",
  };
}
