export function aggregateInterviewScores(candidate = {}) {
  const scorecards = candidate.scorecards || [];
  const avgTechnical = scorecards.reduce((acc, s) => acc + (s.technicalScore || 0), 0) / (scorecards.length || 1);
  const avgCultural = scorecards.reduce((acc, s) => acc + (s.culturalFitScore || 0), 0) / (scorecards.length || 1);
  const overallScore = (avgTechnical + avgCultural) / 2;
  return {
    candidateName: candidate.name || "John Doe",
    totalInterviewsCompleted: scorecards.length,
    avgTechnicalRating: Math.round(avgTechnical * 10) / 10,
    avgCulturalRating: Math.round(avgCultural * 10) / 10,
    overallRating: Math.round(overallScore * 10) / 10,
    hiringRecommendation: overallScore >= 4.0 ? "STRONG_HIRE" : overallScore >= 3.0 ? "NEEDS_DISCUSSION" : "NO_HIRE",
  };
}
