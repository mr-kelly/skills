// Pure domain logic for the Predictive Recommendation Analytics Desk, ported
// verbatim (same variable names, same order of operations, only TS types
// stripped) from the retired lib/types.ts, lib/rng.ts, lib/segments.ts,
// lib/sessions.ts, lib/predict.ts, lib/funnel.ts, lib/backtest.ts, and
// lib/dataset.ts. Shared by three callers that must always agree: the
// trusted seed script (scripts/generate_batch.mjs), the live Busabase read
// path (js/providers/busabase-provider.js), and the offline ?demo= scenario
// (js/providers/demo-provider.js).
//
// Everything here models a GENERIC, brand-free consumer booking-funnel
// product. There is no real ML/LLM call anywhere — "predicted next action"
// is always the fixed if/else rule in evaluateRules()/predictNextAction().

export const FUNNEL_STAGES = ["browse", "search", "compare", "booking_attempt", "complete"];

export const NEXT_ACTIONS = [
  "send_discount_offer",
  "show_urgency_banner",
  "recommend_similar_items",
  "send_reminder_email",
  "no_action_needed",
];

export const DECISION_STATUSES = new Set(["trusted", "needs_recalibration"]);

// ---- Segment archetypes, ported verbatim from the retired lib/segments.ts.
// session_count is scaled down 0.4x from the original (60/55/45/50/40) to
// keep the Busabase `sessions` Base's total row count at 100, the server's
// records.list limit cap — the RNG stream per segment is unaffected (each
// segment draws from its own `${seed}:${segment.id}` stream in order, so the
// first N sessions kept are bit-identical to the original uncapped run; only
// the generation loop stops earlier). ----
export const SEGMENTS = [
  {
    id: "price_sensitive_browser",
    name_key: "segment.price_sensitive_browser.name",
    description_key: "segment.price_sensitive_browser.description",
    continuation_rates: [0.62, 0.5, 0.32, 0.55],
    session_length_range: [2, 9],
    // Kept below DEAL_CART_ABANDON_MIN (3) so this segment is driven by heavy
    // price-checking, not cart abandonment -- distinguishes it from
    // deal_hunter, which trips the same discount rule via high abandon counts.
    cart_abandon_range: [0, 2],
    price_check_range: [5, 14],
    days_since_last_visit_range: [0, 3],
    coupon_click_range: [1, 5],
    session_count: 24,
  },
  {
    id: "repeat_traveler",
    name_key: "segment.repeat_traveler.name",
    description_key: "segment.repeat_traveler.description",
    continuation_rates: [0.8, 0.72, 0.68, 0.82],
    session_length_range: [4, 14],
    cart_abandon_range: [0, 2],
    price_check_range: [1, 4],
    // Kept below LAPSED_DAYS_SINCE_MIN (10) so a loyal, frequently-returning
    // traveler isn't misclassified as a lapsed/churned visitor.
    days_since_last_visit_range: [2, 8],
    coupon_click_range: [0, 1],
    session_count: 22,
  },
  {
    id: "last_minute_booker",
    name_key: "segment.last_minute_booker.name",
    description_key: "segment.last_minute_booker.description",
    continuation_rates: [0.7, 0.66, 0.6, 0.74],
    session_length_range: [1, 5],
    cart_abandon_range: [0, 2],
    price_check_range: [1, 3],
    days_since_last_visit_range: [0, 1],
    coupon_click_range: [0, 1],
    session_count: 18,
  },
  {
    id: "deal_hunter",
    name_key: "segment.deal_hunter.name",
    description_key: "segment.deal_hunter.description",
    continuation_rates: [0.58, 0.46, 0.28, 0.4],
    session_length_range: [3, 11],
    cart_abandon_range: [2, 6],
    price_check_range: [6, 16],
    days_since_last_visit_range: [1, 5],
    coupon_click_range: [3, 9],
    session_count: 20,
  },
  {
    id: "high_intent_planner",
    name_key: "segment.high_intent_planner.name",
    description_key: "segment.high_intent_planner.description",
    continuation_rates: [0.85, 0.78, 0.74, 0.88],
    session_length_range: [6, 18],
    cart_abandon_range: [0, 1],
    price_check_range: [2, 5],
    days_since_last_visit_range: [2, 20],
    coupon_click_range: [0, 2],
    session_count: 16,
  },
];

export function segmentById(id = "") {
  return SEGMENTS.find((segment) => segment.id === id);
}

// ---- Deterministic seeded PRNG (mulberry32) + a string hash seed helper,
// ported verbatim from the retired lib/rng.ts. Pure module: no fs, no
// network, no Date.now(), no Math.random() — every number stream is 100%
// reproducible from the seed string. ----

export function hashSeed(input = "") {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed = 0) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seedText = "") {
  return mulberry32(hashSeed(seedText));
}

export function randInt(rng, min = 0, max = 0) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(rng, min = 0, max = 0, digits = 2) {
  const value = rng() * (max - min) + min;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function pick(rng, list = []) {
  return list[Math.floor(rng() * list.length)];
}

// ---- Deterministic, rule-based "next best action" heuristic, ported
// verbatim from the retired lib/predict.ts. This is NOT any real ML/LLM
// model — it is a small, explicit if/else scoring function over mock
// session features. Given the same features it always returns the same
// Prediction. ----

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
 * segment detail view can show the full trigger list ("why this prediction").
 */
export function evaluateRules({
  session_length = 0,
  cart_abandon_count = 0,
  price_check_count = 0,
  days_since_last_visit = 0,
  reached_stage = "browse",
} = {}) {
  const features = { session_length, cart_abandon_count, price_check_count, days_since_last_visit, reached_stage };
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

export function predictNextAction(features = {}) {
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

function confidenceFor(action, f = {}) {
  const t = RULE_THRESHOLDS;
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  switch (action) {
    case "send_discount_offer":
      return clamp01(
        0.5 +
          ((f.cart_abandon_count || 0) - t.DEAL_CART_ABANDON_MIN) * 0.08 +
          ((f.price_check_count || 0) - t.DEAL_PRICE_CHECK_MIN) * 0.03,
      );
    case "show_urgency_banner":
      return clamp01(0.6 + (t.URGENCY_DAYS_SINCE_MAX - (f.days_since_last_visit || 0)) * 0.15);
    case "no_action_needed":
      return clamp01(0.55 + ((f.session_length || 0) - t.CONVERTED_SESSION_LENGTH_MIN) * 0.03);
    case "send_reminder_email":
      return clamp01(0.4 + ((f.days_since_last_visit || 0) - t.LAPSED_DAYS_SINCE_MIN) * 0.01);
    default:
      return 0.3;
  }
}

// ---- Deterministic mock user-behavior session generator, ported verbatim
// from the retired lib/sessions.ts. Every session's features, the funnel
// stage it reached, and its "ground truth" actual next action are derived
// from a seeded PRNG — running this twice with the same seed always yields
// byte-identical output, which is required for the backtest/prediction-
// accuracy view to be reproducible. Used by scripts/generate_batch.mjs (the
// trusted seed step) and by the offline ?demo= provider (which never reads
// Busabase, so it regenerates the same fixed sample in the browser). ----

export const DEFAULT_DATASET_SEED = "predictive-recommendation-analytics-desk-v1";

function reachedStage(rng, segment) {
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

function actualAction(rng, predicted, features) {
  // Deterministic "ground truth" outcome. Mostly agrees with the rule-based
  // prediction (so the backtest reads as a reasonably good heuristic) but a
  // seeded fraction of sessions disagree, biased toward plausible confusions,
  // so precision/recall are not trivially 100%.
  const agreementRoll = rng();
  const agreementThreshold = features.cart_abandon_count >= 3 ? 0.78 : 0.85;
  if (agreementRoll < agreementThreshold) return predicted;

  const confusionMap = {
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

export function generateSessionsForSegment(segment, seed = DEFAULT_DATASET_SEED) {
  const rng = createRng(`${seed}:${segment.id}`);
  const sessions = [];
  for (let i = 0; i < segment.session_count; i += 1) {
    const sessionId = `${segment.id}-${String(i + 1).padStart(3, "0")}`;
    const features = {
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

export function generateAllSessions(seed = DEFAULT_DATASET_SEED) {
  return SEGMENTS.flatMap((segment) => generateSessionsForSegment(segment, seed));
}

// ---- Deterministic funnel aggregation, ported verbatim from the retired
// lib/funnel.ts: for a set of sessions, how many reached each stage, and the
// stage-to-stage drop-off percentage. ----

export function computeFunnelCounts(sessions = [], segmentId = "overall") {
  const stageOrder = FUNNEL_STAGES;
  const stageIndex = Object.fromEntries(stageOrder.map((stage, index) => [stage, index]));

  const stage_counts = Object.fromEntries(stageOrder.map((stage) => [stage, 0]));
  for (const session of sessions) {
    const reachedIndex = stageIndex[session.reached_stage];
    for (let i = 0; i <= reachedIndex; i += 1) {
      stage_counts[stageOrder[i]] += 1;
    }
  }

  const drop_off_pct = {};
  for (let i = 1; i < stageOrder.length; i += 1) {
    const prevCount = stage_counts[stageOrder[i - 1]];
    const currCount = stage_counts[stageOrder[i]];
    drop_off_pct[stageOrder[i]] = prevCount > 0 ? round1(((prevCount - currCount) / prevCount) * 100) : 0;
  }

  return { segment_id: segmentId, stage_counts, drop_off_pct };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// ---- Deterministic precision/recall-style backtest, ported verbatim from
// the retired lib/backtest.ts: compares each session's rule-based
// predicted_action against its mock actual_action and reports a
// confusion-matrix style summary per action, plus macro averages. ----

export function computeBacktest(sessions = [], segmentId = "overall") {
  const total = sessions.length;
  const correct = sessions.filter((s) => s.predicted_action === s.actual_action).length;

  const per_action = NEXT_ACTIONS.map((action) => computeCell(sessions, action));

  const macro_precision = round3(average(per_action.map((c) => c.precision)));
  const macro_recall = round3(average(per_action.map((c) => c.recall)));
  const macro_f1 = round3(average(per_action.map((c) => c.f1)));

  return {
    segment_id: segmentId,
    total,
    correct,
    accuracy: total > 0 ? round3(correct / total) : 0,
    per_action,
    macro_precision,
    macro_recall,
    macro_f1,
  };
}

function computeCell(sessions, action) {
  let true_positive = 0;
  let false_positive = 0;
  let false_negative = 0;
  let support = 0;
  for (const s of sessions) {
    const predicted = s.predicted_action === action;
    const actual = s.actual_action === action;
    if (actual) support += 1;
    if (predicted && actual) true_positive += 1;
    else if (predicted && !actual) false_positive += 1;
    else if (!predicted && actual) false_negative += 1;
  }
  const precision = true_positive + false_positive > 0 ? true_positive / (true_positive + false_positive) : 0;
  const recall = true_positive + false_negative > 0 ? true_positive / (true_positive + false_negative) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    action,
    true_positive,
    false_positive,
    false_negative,
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    support,
  };
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// ---- Normalization: a Busabase `sessions` row (already snake_cased by the
// provider) only carries the raw features + the seeded actual_action (the
// one thing that is NOT a pure function of the features — it comes from an
// RNG roll made when the row was generated). predicted_action/triggers are
// always recomputed here via predictNextAction(), never stored, so the
// board is always fresh regardless of when a browser session loads it. ----

export function computeSessionResult({
  session_id = "",
  segment_id = "",
  session_length = 0,
  cart_abandon_count = 0,
  price_check_count = 0,
  days_since_last_visit = 0,
  coupon_clicks = 0,
  reached_stage = "browse",
  actual_action = "no_action_needed",
} = {}) {
  const features = {
    session_id,
    segment_id,
    session_length: Number(session_length) || 0,
    cart_abandon_count: Number(cart_abandon_count) || 0,
    price_check_count: Number(price_check_count) || 0,
    days_since_last_visit: Number(days_since_last_visit) || 0,
    coupon_clicks: Number(coupon_clicks) || 0,
    reached_stage,
  };
  const prediction = predictNextAction(features);
  return {
    ...features,
    predicted_action: prediction.action,
    actual_action,
    triggers: prediction.triggers,
  };
}

// ---- Prediction summary, ported verbatim from the retired lib/dataset.ts's
// predictionSummary(). ----

export function buildPredictionSummary(segmentId = "", sessions = []) {
  const action_distribution = Object.fromEntries(NEXT_ACTIONS.map((action) => [action, 0]));
  for (const s of sessions) action_distribution[s.predicted_action] += 1;
  const dominant_action = NEXT_ACTIONS.reduce((best, action) =>
    action_distribution[action] > action_distribution[best] ? action : best,
  );
  const sample_triggers = sessions.find((s) => s.predicted_action === dominant_action)?.triggers ?? [];
  return { segment_id: segmentId, dominant_action, action_distribution, sample_triggers };
}

// Assembles one SegmentDatasetEntry (funnel/prediction_summary/backtest/
// sessions), mirroring the retired lib/dataset.ts's buildDataset() per-
// segment map step, given already-computed SessionResult rows for that
// segment (computeSessionResult() applied to the raw Busabase/demo rows).
export function buildSegmentEntry(segmentId = "", sessions = []) {
  return {
    segment_id: segmentId,
    session_count: sessions.length,
    funnel: computeFunnelCounts(sessions, segmentId),
    prediction_summary: buildPredictionSummary(segmentId, sessions),
    backtest: computeBacktest(sessions, segmentId),
    sessions,
  };
}

// Assembles the full run object the UI renders, mirroring the retired
// lib/dataset.ts's Dataset shape (overall_funnel/overall_backtest/segments),
// given every already-computed SessionResult row (across all segments).
export function buildRun({ sessions = [], seed = DEFAULT_DATASET_SEED } = {}) {
  const segments = SEGMENTS.map((segment) => {
    const segmentSessions = sessions.filter((s) => s.segment_id === segment.id);
    return buildSegmentEntry(segment.id, segmentSessions);
  });
  return {
    schema_version: "1",
    seed,
    generated_at_note:
      "Deterministic mock dataset — regenerate any time with scripts/generate_batch.mjs; output is byte-identical for the same seed.",
    overall_funnel: computeFunnelCounts(sessions, "overall"),
    overall_backtest: computeBacktest(sessions, "overall"),
    segments,
  };
}

// ---- Decisions: normalizes the `segments` Base's decision fields (already
// snake_cased by the provider) into the Decision shape the UI renders, or
// null when the segment has not been reviewed yet. Ported from the retired
// local-file provider's decisions.json shape, now living directly on the
// segment's own Busabase record instead of a separate handoff file. ----

export function computeDecision({ decision_status = "", decision_note = "", decided_at = "" } = {}) {
  if (!decision_status) return null;
  return { status: decision_status, note: decision_note, decided_at };
}

// ---- Settings row helpers. The `settings` Base holds a single row keyed by
// record-id/kind = "config", ported from the retired local-file provider's
// summarizeConfig() defaults. ----

function parseJsonPayload(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

export function buildConfigSummary(settingsRows = []) {
  const configRow = findSettingsRow(settingsRows, "config");
  const config = parseJsonPayload(configRow?.payload);
  return {
    config_path: "busabase",
    is_example: !configRow,
    data_provider: "busabase",
    product_name: config.product_name || "Example Booking Co.",
    vertical: config.vertical || "consumer travel/booking",
    target_precision: typeof config.target_precision === "number" ? config.target_precision : 0.6,
    seed: config.seed || DEFAULT_DATASET_SEED,
  };
}
