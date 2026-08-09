export function evaluateBorrowerCredit(borrower = {}) {
  const dscr = borrower.ebitda > 0 && borrower.annualDebtService > 0 ? borrower.ebitda / borrower.annualDebtService : 0;
  const ltv =
    borrower.loanAmount > 0 && borrower.collateralValue > 0
      ? (borrower.loanAmount / borrower.collateralValue) * 100
      : 100;
  const approved = dscr >= 1.25 && ltv <= 75;
  return {
    borrowerName: borrower.name || "Corporate Applicant",
    dscrRatio: Math.round(dscr * 100) / 100,
    ltvPct: Math.round(ltv * 10) / 10,
    underwritingDecision: approved ? "APPROVED_PRE_COMMITMENT" : "REJECTED_HIGH_DEBT_RISK",
    maxRecommendedLimit: approved ? Math.round(borrower.collateralValue * 0.75) : 0,
  };
}
