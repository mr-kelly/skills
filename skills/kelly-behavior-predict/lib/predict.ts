// Deterministic, rule-based "next best action" heuristic. This is NOT any
// real ML/LLM model — it is a small, explicit if/else scoring function over
// mock session features. Given the same SessionFeatures it always returns the
// same Prediction, which is what makes the backtest view reproducible.
//
// Pure module: no fs, no network, no randomness.

import type { Prediction, RuleTrigger, SessionFeatures } from "./types.ts";

export const RULE_THRESHOLDS = {
  DEAL_CART_ABANDON_MIN: 3,
  DEAL_PRICE_CHECK_MIN: 6,
  URGENCY_DAYS_SINCE_MAX: 1,
  CONVERTED_SESSION_LENGTH_MIN: 8,
  CONVERTED_CART_ABANDON_MAX: 1,
  LAPSED_DAYS_SINCE_MIN: 10,
};

/**
 * Evaluate every rule against the given features and report which ones
 * matched, in priority order. The first matching rule (top to bottom)
 * determines the predicted action; later rules are still evaluated so the
 * segment detail view can show the full trigger list ("why this action").
 */
export function evaluateRules(features: SessionFeatures): RuleTrigger[] {
  const t = RULE_THRESHOLDS;
  return [
    {
      code: "high_cart_abandon_and_price_checking",
      description: `cart_abandon_count >= ${t.DEAL_CART_ABANDON_MIN} and price_check_count >= ${t.DEAL_PRICE_CHECK_MIN}`,
      matched:
        features.cart_abandon_count >= t.DEAL_CART_ABANDON_MIN && features.price_check_count >= t.DEAL_PRICE_CHECK_MIN,
    },
    {
      code: "recent_visit_deep_in_funnel",
      description: `days_since_last_visit <= ${t.URGENCY_DAYS_SINCE_MAX} and reached_stage in [compare, booking_attempt]`,
      matched:
        features.days_since_last_visit <= t.URGENCY_DAYS_SINCE_MAX &&
        (features.reached_stage === "compare" || features.reached_stage === "booking_attempt"),
    },
    {
      code: "long_session_low_abandon_completed",
      description: `session_length >= ${t.CONVERTED_SESSION_LENGTH_MIN} and cart_abandon_count <= ${t.CONVERTED_CART_ABANDON_MAX} and reached_stage == complete`,
      matched:
        features.session_length >= t.CONVERTED_SESSION_LENGTH_MIN &&
        features.cart_abandon_count <= t.CONVERTED_CART_ABANDON_MAX &&
        features.reached_stage === "complete",
    },
    {
      code: "lapsed_visitor",
      description: `days_since_last_visit >= ${t.LAPSED_DAYS_SINCE_MIN}`,
      matched: features.days_since_last_visit >= t.LAPSED_DAYS_SINCE_MIN,
    },
    {
      code: "default_exploration",
      description: "no higher-priority rule matched (default fallback)",
      matched: true,
    },
  ];
}

export function predictNextAction(features: SessionFeatures): Prediction {
  const triggers = evaluateRules(features);

  const first = triggers.find((trigger) => trigger.matched);
  const action =
    first?.code === "high_cart_abandon_and_price_checking"
      ? "send_discount_offer"
      : first?.code === "recent_visit_deep_in_funnel"
        ? "show_urgency_banner"
        : first?.code === "long_session_low_abandon_completed"
          ? "no_action_needed"
          : first?.code === "lapsed_visitor"
            ? "send_reminder_email"
            : "recommend_similar_items";

  // Deterministic confidence score: how decisively the winning rule matched,
  // expressed as a 0-1 value derived from feature margins (not a real model
  // probability — a readable proxy for "how strong was the trigger").
  const score = confidenceFor(action, features);

  return { action, score, triggers };
}

function confidenceFor(action: Prediction["action"], f: SessionFeatures): number {
  const t = RULE_THRESHOLDS;
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  switch (action) {
    case "send_discount_offer":
      return clamp01(
        0.5 +
          (f.cart_abandon_count - t.DEAL_CART_ABANDON_MIN) * 0.08 +
          (f.price_check_count - t.DEAL_PRICE_CHECK_MIN) * 0.03,
      );
    case "show_urgency_banner":
      return clamp01(0.6 + (t.URGENCY_DAYS_SINCE_MAX - f.days_since_last_visit) * 0.15);
    case "no_action_needed":
      return clamp01(0.55 + (f.session_length - t.CONVERTED_SESSION_LENGTH_MIN) * 0.03);
    case "send_reminder_email":
      return clamp01(0.4 + (f.days_since_last_visit - t.LAPSED_DAYS_SINCE_MIN) * 0.01);
    default:
      return 0.3;
  }
}
