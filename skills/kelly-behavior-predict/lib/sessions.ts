// Deterministic mock user-behavior session generator. Every session's
// features, the funnel stage it reached, and its "ground truth" actual next
// action are derived from a seeded PRNG — running this twice with the same
// seed always yields byte-identical output, which is required for the
// backtest / prediction-accuracy view to be reproducible.

import { predictNextAction } from "./predict.ts";
import { createRng, randFloat, randInt } from "./rng.ts";
import { SEGMENTS } from "./segments.ts";
import { FUNNEL_STAGES } from "./types.ts";
import type { NextAction, SegmentDefinition, SessionFeatures, SessionResult } from "./types.ts";

export const DEFAULT_DATASET_SEED = "predictive-recommendation-analytics-desk-v1";

function reachedStage(rng: () => number, segment: SegmentDefinition): SessionFeatures["reached_stage"] {
  // Walk the funnel; at each transition roll against the segment's baseline
  // continuation rate. The first stage a session fails to continue past is
  // where it stops (drop-off); reaching the end of the array means "complete".
  let stageIndex = 0;
  for (const rate of segment.continuation_rates) {
    if (rng() > rate) break;
    stageIndex += 1;
  }
  return FUNNEL_STAGES[stageIndex];
}

function actualAction(rng: () => number, predicted: NextAction, features: SessionFeatures): NextAction {
  // Deterministic "ground truth" outcome. Mostly agrees with the rule-based
  // prediction (so the backtest reads as a reasonably good heuristic) but a
  // seeded fraction of sessions disagree, biased toward plausible confusions,
  // so precision/recall are not trivially 100%.
  const agreementRoll = rng();
  const agreementThreshold = features.cart_abandon_count >= 3 ? 0.78 : 0.85;
  if (agreementRoll < agreementThreshold) return predicted;

  const confusionMap: Record<NextAction, NextAction[]> = {
    send_discount_offer: ["recommend_similar_items", "show_urgency_banner"],
    show_urgency_banner: ["send_discount_offer", "send_reminder_email"],
    no_action_needed: ["recommend_similar_items"],
    send_reminder_email: ["no_action_needed", "recommend_similar_items"],
    recommend_similar_items: ["send_discount_offer", "no_action_needed"],
  };
  const alternatives = confusionMap[predicted];
  const pickIndex = Math.floor(rng() * alternatives.length);
  return alternatives[pickIndex];
}

export function generateSessionsForSegment(segment: SegmentDefinition, seed: string): SessionResult[] {
  const rng = createRng(`${seed}:${segment.id}`);
  const sessions: SessionResult[] = [];
  for (let i = 0; i < segment.session_count; i += 1) {
    const sessionId = `${segment.id}-${String(i + 1).padStart(3, "0")}`;
    const features: SessionFeatures = {
      session_id: sessionId,
      segment_id: segment.id,
      session_length: randFloat(rng, segment.session_length_range[0], segment.session_length_range[1], 1),
      cart_abandon_count: randInt(rng, segment.cart_abandon_range[0], segment.cart_abandon_range[1]),
      price_check_count: randInt(rng, segment.price_check_range[0], segment.price_check_range[1]),
      days_since_last_visit: randInt(
        rng,
        segment.days_since_last_visit_range[0],
        segment.days_since_last_visit_range[1],
      ),
      coupon_clicks: randInt(rng, segment.coupon_click_range[0], segment.coupon_click_range[1]),
      reached_stage: reachedStage(rng, segment),
    };
    const prediction = predictNextAction(features);
    const actual = actualAction(rng, prediction.action, features);
    sessions.push({
      ...features,
      predicted_action: prediction.action,
      actual_action: actual,
      triggers: prediction.triggers,
    });
  }
  return sessions;
}

export function generateAllSessions(seed: string = DEFAULT_DATASET_SEED): SessionResult[] {
  return SEGMENTS.flatMap((segment) => generateSessionsForSegment(segment, seed));
}
