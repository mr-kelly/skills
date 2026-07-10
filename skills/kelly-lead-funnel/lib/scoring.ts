// Deterministic, rule-based lead-quality scoring for the Deal Sourcing Funnel.
//
// This is NOT an LLM call and NEVER should be: it is a pure function of a
// lead's fields and the fund's scoring_criteria config. Every point on the
// 0-100 scale is explained by a ScoreFactor row (factor, weight, contribution,
// rationale) so the UI can show a transparent breakdown instead of a black
// box. Pure module: no fs, no network, no side effects.
//
// Weights (sum to 100):
//   30  chain_size_fit        — store_count vs the fund's ideal chain-size band
//   30  revenue_scale_fit     — est_monthly_revenue vs the fund's target check size
//   25  category_risk         — merchant category risk tier
//   15  data_verifiability    — whether the lead's business data can be verified

import type { Category, Lead, ScoreFactor, ScoringCriteria } from "./types.ts";

export const DEFAULT_SCORING_CRITERIA: Required<
  Pick<
    ScoringCriteria,
    | "ideal_store_count_min"
    | "ideal_store_count_max"
    | "ideal_monthly_revenue_min"
    | "ideal_monthly_revenue_max"
    | "low_risk_categories"
    | "medium_risk_categories"
    | "higher_risk_categories"
  >
> = {
  ideal_store_count_min: 5,
  ideal_store_count_max: 150,
  ideal_monthly_revenue_min: 50000,
  ideal_monthly_revenue_max: 2000000,
  low_risk_categories: ["services", "healthcare"],
  medium_risk_categories: ["food_beverage", "ecommerce"],
  higher_risk_categories: ["retail_discretionary", "other"],
};

function resolveCriteria(criteria?: ScoringCriteria) {
  return { ...DEFAULT_SCORING_CRITERIA, ...(criteria || {}) };
}

function chainSizeFactor(storeCount: number, criteria: ReturnType<typeof resolveCriteria>): ScoreFactor {
  const { ideal_store_count_min: min, ideal_store_count_max: max } = criteria;
  let contribution: number;
  let rationale: string;
  if (storeCount >= min && storeCount <= max) {
    contribution = 30;
    rationale = `${storeCount} stores is within the ideal ${min}-${max} chain-size band.`;
  } else if (storeCount >= 2 && storeCount < min) {
    contribution = 18;
    rationale = `${storeCount} stores is below the ideal band (${min}+); early-stage chain risk.`;
  } else if (storeCount < 2) {
    contribution = 10;
    rationale = "Single-unit business; higher concentration/key-person risk.";
  } else if (storeCount > max && storeCount <= max * 3.3) {
    contribution = 22;
    rationale = `${storeCount} stores exceeds the ideal band; likely has other financing options.`;
  } else {
    contribution = 12;
    rationale = `${storeCount} stores is far outside the target band for this check size.`;
  }
  return { factor: "chain_size_fit", weight: 30, contribution, rationale };
}

function revenueScaleFactor(monthlyRevenue: number, criteria: ReturnType<typeof resolveCriteria>): ScoreFactor {
  const { ideal_monthly_revenue_min: min, ideal_monthly_revenue_max: max } = criteria;
  let contribution: number;
  let rationale: string;
  if (monthlyRevenue >= min && monthlyRevenue <= max) {
    contribution = 30;
    rationale = `Est. monthly revenue fits the target check-size band (${money(min)}-${money(max)}).`;
  } else if (monthlyRevenue >= min * 0.4 && monthlyRevenue < min) {
    contribution = 18;
    rationale = `Est. monthly revenue is below the target band (${money(min)}+); may need a smaller facility.`;
  } else if (monthlyRevenue < min * 0.4) {
    contribution = 8;
    rationale = "Est. monthly revenue is well below the fund's minimum check size.";
  } else if (monthlyRevenue > max && monthlyRevenue <= max * 2.5) {
    contribution = 20;
    rationale = "Est. monthly revenue exceeds the target band; likely qualifies for cheaper bank credit.";
  } else {
    contribution = 10;
    rationale = "Est. monthly revenue is far outside the fund's target check size.";
  }
  return { factor: "revenue_scale_fit", weight: 30, contribution, rationale };
}

function categoryRiskFactor(category: Category, criteria: ReturnType<typeof resolveCriteria>): ScoreFactor {
  let contribution: number;
  let tier: string;
  if (criteria.low_risk_categories.includes(category)) {
    contribution = 25;
    tier = "low";
  } else if (criteria.medium_risk_categories.includes(category)) {
    contribution = 18;
    tier = "medium";
  } else if (criteria.higher_risk_categories.includes(category)) {
    contribution = 12;
    tier = "higher";
  } else {
    contribution = 15;
    tier = "unclassified";
  }
  return {
    factor: "category_risk",
    weight: 25,
    contribution,
    rationale: `${categoryLabel(category)} is a ${tier}-risk category for revenue-based financing.`,
  };
}

function dataVerifiabilityFactor(verifiable: boolean): ScoreFactor {
  return {
    factor: "data_verifiability",
    weight: 15,
    contribution: verifiable ? 15 : 5,
    rationale: verifiable
      ? "Bank/POS or platform data is available for independent verification."
      : "No independently verifiable revenue data yet; underwriting risk until verified.",
  };
}

function categoryLabel(category: Category): string {
  return category.replaceAll("_", " ");
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Compute a deterministic 0-100 lead-quality score with a full factor
 * breakdown. Pure function: (lead, criteria) -> { score, breakdown }.
 */
export function scoreLead(
  lead: Pick<Lead, "store_count" | "est_monthly_revenue" | "category" | "data_verifiable">,
  criteria?: ScoringCriteria,
): { score: number; breakdown: ScoreFactor[] } {
  const resolved = resolveCriteria(criteria);
  const breakdown = [
    chainSizeFactor(lead.store_count, resolved),
    revenueScaleFactor(lead.est_monthly_revenue, resolved),
    categoryRiskFactor(lead.category, resolved),
    dataVerifiabilityFactor(lead.data_verifiable),
  ];
  const score = Math.round(breakdown.reduce((sum, factor) => sum + factor.contribution, 0));
  return { score, breakdown };
}

/**
 * Suggest the next concrete action for a lead given its score and stage.
 * Deterministic mapping, not a recommendation engine.
 */
export function suggestNextAction(score: number, stage: Lead["stage"]): string {
  if (stage === "rejected") return "closed_no_action";
  if (stage === "term_sheet_ready") return "hand_off_to_underwriting";
  if (!scoreQualifiesForVerification(score) && stage === "new") return "flag_for_reject_review";
  if (score >= 75) return "advance_to_term_sheet";
  if (score >= 55) return stage === "new" ? "request_data_verification" : "advance_to_scored";
  return "flag_for_reject_review";
}

function scoreQualifiesForVerification(score: number): boolean {
  return score >= 30;
}
