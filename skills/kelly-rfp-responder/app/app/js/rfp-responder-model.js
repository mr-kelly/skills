export function evaluateRfpCoverage(rfp = {}) {
  const questions = rfp.questions || [];
  const answered = questions.filter((q) => q.hasPreApprovedAnswer).length;
  return {
    rfpTitle: rfp.title || "Enterprise RFP",
    totalQuestions: questions.length,
    answeredQuestions: answered,
    coveragePct: questions.length > 0 ? Math.round((answered / questions.length) * 100) : 100,
    status: answered === questions.length ? "READY_FOR_SUBMISSION" : "AWAITING_SECURITY_SIGN_OFF",
  };
}
