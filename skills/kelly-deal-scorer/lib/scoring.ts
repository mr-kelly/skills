// Deterministic, fully auditable deal-scoring rubric. Plain arithmetic only —
// no LLM call, no API call, no randomness. Every sub-factor here is hand
// recomputable from the candidate's raw fields plus the rubric config below,
// so a human reviewer can check the app's numbers with a calculator.
//
// Shared by the app server (app/server/store.ts, app/server/demo.ts) and the
// scripts (scripts/generate_batch.ts) so the UI and the batch generator always
// agree on the same rubric.

import type { Category, Rubric, ScoreBreakdown, ScoreFactor } from "../app/server/types.ts";

export const DEFAULT_RUBRIC: Rubric = {
  weights: {
    stability: 0.25,
    growth: 0.2,
    category_risk: 0.15,
    principal_ratio: 0.25,
    track_record: 0.15,
  },
  category_risk_tier: {
    Education: 90,
    Fitness: 70,
    Retail: 65,
    "F&B": 50,
  },
  decision_thresholds: {
    high_confidence_min: 78,
    needs_review_min: 50,
  },
  revenue_share_rate: {
    base_min_pct: 6,
    base_max_pct: 14,
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Revenue stability/volatility: 100 - (coefficient of variation * 100), clamped
 * to [0, 100]. CV = stdDev / mean. Lower volatility -> higher score.
 */
export function scoreStability(monthlyRevenue: number[]): { score: number; detail: string } {
  const avg = mean(monthlyRevenue);
  const sd = stdDev(monthlyRevenue, avg);
  const cv = avg > 0 ? sd / avg : 1;
  const score = clamp(100 - cv * 100, 0, 100);
  return {
    score: round1(score),
    detail: `avg=${round1(avg)}, stdDev=${round1(sd)}, CV=${round1(cv * 100)}% -> 100 - CV% = ${round1(score)}`,
  };
}

/**
 * Growth trend: compares the average of the most recent 3 months against the
 * average of the earliest 3 months. Percent change is mapped onto a 0-100
 * scale centered at 50 (flat), +/-2 points per 1% change, clamped.
 */
export function scoreGrowth(monthlyRevenue: number[]): { score: number; detail: string } {
  const n = monthlyRevenue.length;
  const window = Math.min(3, Math.floor(n / 2) || 1);
  const early = monthlyRevenue.slice(0, window);
  const recent = monthlyRevenue.slice(n - window);
  const earlyAvg = mean(early);
  const recentAvg = mean(recent);
  const pctChange = earlyAvg > 0 ? ((recentAvg - earlyAvg) / earlyAvg) * 100 : 0;
  const score = clamp(50 + pctChange * 2, 0, 100);
  return {
    score: round1(score),
    detail: `first ${window}-mo avg=${round1(earlyAvg)}, last ${window}-mo avg=${round1(recentAvg)}, change=${round1(pctChange)}% -> 50 + change%*2 = ${round1(score)}`,
  };
}

/**
 * Category risk tier: a fixed lookup table of default risk scores per vertical,
 * from the rubric config (editable per fund policy). Missing categories fall
 * back to 60 (moderate).
 */
export function scoreCategoryRisk(
  category: Category,
  tierTable: Record<string, number> = DEFAULT_RUBRIC.category_risk_tier,
): { score: number; detail: string } {
  const score = tierTable[category] ?? 60;
  return {
    score: round1(score),
    detail: `category "${category}" risk tier lookup = ${round1(score)}`,
  };
}

/**
 * Requested-principal-to-revenue ratio: principal divided by trailing average
 * monthly revenue gives a "months of revenue requested" multiple. Lower
 * multiples score higher. 0-2x -> 100..70, 2-4x -> 70..40, 4-8x -> 40..0.
 */
export function scorePrincipalRatio(
  requestedPrincipal: number,
  monthlyRevenue: number[],
): { score: number; ratio: number; detail: string } {
  const avgMonthly = mean(monthlyRevenue);
  const ratio = avgMonthly > 0 ? requestedPrincipal / avgMonthly : 999;
  let score: number;
  if (ratio <= 2)
    score = 100 - (ratio / 2) * 30; // 100 at 0x, 70 at 2x
  else if (ratio <= 4)
    score = 70 - ((ratio - 2) / 2) * 30; // 70 at 2x, 40 at 4x
  else if (ratio <= 8)
    score = 40 - ((ratio - 4) / 4) * 40; // 40 at 4x, 0 at 8x
  else score = 0;
  score = clamp(score, 0, 100);
  return {
    score: round1(score),
    ratio: round1(ratio),
    detail: `principal=${requestedPrincipal} / avg monthly revenue=${round1(avgMonthly)} = ${round1(ratio)}x -> ${round1(score)}`,
  };
}

/**
 * Track record/scale: rewards a longer revenue history and larger absolute
 * average monthly revenue. 60% weight on months of history (capped at 12mo =
 * full marks), 40% weight on scale (avg monthly revenue vs. a $50k benchmark).
 */
export function scoreTrackRecord(monthlyRevenue: number[]): { score: number; detail: string } {
  const months = monthlyRevenue.length;
  const historyScore = clamp((months / 12) * 100, 0, 100);
  const avgMonthly = mean(monthlyRevenue);
  const scaleScore = clamp((avgMonthly / 50000) * 100, 0, 100);
  const score = historyScore * 0.6 + scaleScore * 0.4;
  return {
    score: round1(score),
    detail: `history=${months}mo -> ${round1(historyScore)} (60%), scale avg=${round1(avgMonthly)} vs $50k benchmark -> ${round1(scaleScore)} (40%) = ${round1(score)}`,
  };
}

/**
 * Suggested revenue-share rate range: starts from the rubric's base range and
 * narrows/shifts down as the composite score improves — higher-scoring
 * candidates are offered a lower, tighter rate band; weaker candidates get a
 * wider band biased toward the top of the range. Deterministic, no rounding
 * surprises: both bounds are simple linear functions of compositeScore.
 */
export function suggestedShareRate(
  compositeScore: number,
  rubric: Rubric = DEFAULT_RUBRIC,
): { min_pct: number; max_pct: number } {
  const { base_min_pct, base_max_pct } = rubric.revenue_share_rate;
  const t = clamp(compositeScore, 0, 100) / 100; // 0..1, higher = stronger candidate
  const min_pct = base_min_pct + (1 - t) * 2; // 6 at score 100, 8 at score 0
  const max_pct = base_max_pct - t * 3; // 11 at score 100, 14 at score 0
  return { min_pct: round1(min_pct), max_pct: round1(Math.max(max_pct, min_pct + 1)) };
}

/**
 * Compute the full, auditable score breakdown for one candidate. Pure
 * function: same inputs always produce the same output, and every
 * intermediate number is exposed in `detail` for hand recomputation.
 */
export function computeScore(
  candidate: { category: Category; requested_principal: number; monthly_revenue: number[] },
  rubric: Rubric = DEFAULT_RUBRIC,
): ScoreBreakdown {
  const stability = scoreStability(candidate.monthly_revenue);
  const growth = scoreGrowth(candidate.monthly_revenue);
  const categoryRisk = scoreCategoryRisk(candidate.category, rubric.category_risk_tier);
  const principalRatio = scorePrincipalRatio(candidate.requested_principal, candidate.monthly_revenue);
  const trackRecord = scoreTrackRecord(candidate.monthly_revenue);

  const factors: ScoreFactor[] = [
    {
      key: "stability",
      label: "Revenue stability",
      raw_score: stability.score,
      weight: rubric.weights.stability,
      contribution: round1(stability.score * rubric.weights.stability),
      detail: stability.detail,
    },
    {
      key: "growth",
      label: "Growth trend",
      raw_score: growth.score,
      weight: rubric.weights.growth,
      contribution: round1(growth.score * rubric.weights.growth),
      detail: growth.detail,
    },
    {
      key: "category_risk",
      label: "Category risk tier",
      raw_score: categoryRisk.score,
      weight: rubric.weights.category_risk,
      contribution: round1(categoryRisk.score * rubric.weights.category_risk),
      detail: categoryRisk.detail,
    },
    {
      key: "principal_ratio",
      label: "Principal-to-revenue ratio",
      raw_score: principalRatio.score,
      weight: rubric.weights.principal_ratio,
      contribution: round1(principalRatio.score * rubric.weights.principal_ratio),
      detail: principalRatio.detail,
    },
    {
      key: "track_record",
      label: "Track record & scale",
      raw_score: trackRecord.score,
      weight: rubric.weights.track_record,
      contribution: round1(trackRecord.score * rubric.weights.track_record),
      detail: trackRecord.detail,
    },
  ];

  const composite_score = round1(factors.reduce((sum, f) => sum + f.contribution, 0));

  return {
    composite_score,
    factors,
    suggested_share_rate: suggestedShareRate(composite_score, rubric),
  };
}
