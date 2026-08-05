import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DATASET_SEED,
  NEXT_ACTIONS,
  SEGMENTS,
  buildConfigSummary,
  buildPredictionSummary,
  buildRun,
  buildSegmentEntry,
  computeBacktest,
  computeDecision,
  computeFunnelCounts,
  computeSessionResult,
  createRng,
  evaluateRules,
  generateAllSessions,
  predictNextAction,
} from "../app/js/behavior-model.js";

test("SEGMENTS: five archetypes summing to 100 sessions total (the Busabase records.list limit=100 cap)", () => {
  assert.equal(SEGMENTS.length, 5);
  const total = SEGMENTS.reduce((sum, s) => sum + s.session_count, 0);
  assert.equal(total, 100);
  assert.ok(SEGMENTS.every((s) => s.session_count <= 100));
});

test("evaluateRules()/predictNextAction(): high cart-abandon + heavy price-checking -> send_discount_offer", () => {
  const features = {
    session_length: 5,
    cart_abandon_count: 3,
    price_check_count: 6,
    days_since_last_visit: 5,
    reached_stage: "browse",
  };
  const prediction = predictNextAction(features);
  assert.equal(prediction.action, "send_discount_offer");
  const first = evaluateRules(features).find((r) => r.matched);
  assert.equal(first.code, "high_cart_abandon_and_price_checking");
});

test("evaluateRules()/predictNextAction(): recent visit deep in funnel -> show_urgency_banner", () => {
  const features = {
    session_length: 3,
    cart_abandon_count: 0,
    price_check_count: 0,
    days_since_last_visit: 1,
    reached_stage: "compare",
  };
  const prediction = predictNextAction(features);
  assert.equal(prediction.action, "show_urgency_banner");
});

test("evaluateRules()/predictNextAction(): long session, low abandon, completed -> no_action_needed", () => {
  const features = {
    session_length: 8,
    cart_abandon_count: 1,
    price_check_count: 0,
    days_since_last_visit: 5,
    reached_stage: "complete",
  };
  const prediction = predictNextAction(features);
  assert.equal(prediction.action, "no_action_needed");
});

test("evaluateRules()/predictNextAction(): lapsed visitor -> send_reminder_email", () => {
  const features = {
    session_length: 3,
    cart_abandon_count: 0,
    price_check_count: 0,
    days_since_last_visit: 10,
    reached_stage: "browse",
  };
  const prediction = predictNextAction(features);
  assert.equal(prediction.action, "send_reminder_email");
});

test("evaluateRules()/predictNextAction(): no rule matched -> default recommend_similar_items", () => {
  const features = {
    session_length: 3,
    cart_abandon_count: 0,
    price_check_count: 0,
    days_since_last_visit: 5,
    reached_stage: "browse",
  };
  const prediction = predictNextAction(features);
  assert.equal(prediction.action, "recommend_similar_items");
  assert.equal(evaluateRules(features).find((r) => r.matched).code, "default_exploration");
});

test("predictNextAction() gives every destructured feature a default so a partial call never throws", () => {
  assert.doesNotThrow(() => predictNextAction());
  assert.doesNotThrow(() => evaluateRules());
});

test("computeFunnelCounts(): hand-worked 4-session funnel", () => {
  // 4 sessions: one reaches only browse, one search, one compare, one complete.
  const sessions = [
    { reached_stage: "browse" },
    { reached_stage: "search" },
    { reached_stage: "compare" },
    { reached_stage: "complete" },
  ];
  const funnel = computeFunnelCounts(sessions, "test-segment");
  assert.equal(funnel.segment_id, "test-segment");
  assert.deepEqual(funnel.stage_counts, { browse: 4, search: 3, compare: 2, booking_attempt: 1, complete: 1 });
  // drop_off_pct[stage] = (prev - curr) / prev * 100
  assert.equal(funnel.drop_off_pct.search, 25); // (4-3)/4*100
  assert.equal(funnel.drop_off_pct.compare, Math.round(((3 - 2) / 3) * 100 * 10) / 10); // 33.3
  assert.equal(funnel.drop_off_pct.booking_attempt, 50); // (2-1)/2*100
  assert.equal(funnel.drop_off_pct.complete, 0); // (1-1)/1*100
});

test("computeBacktest(): hand-worked confusion matrix for a single action", () => {
  // 4 sessions predicting/actual "send_discount_offer" vs "no_action_needed":
  // TP=1 (predicted+actual match), FP=1 (predicted but actual differs),
  // FN=1 (actual but predicted differs), 1 unrelated pair.
  const sessions = [
    { predicted_action: "send_discount_offer", actual_action: "send_discount_offer" }, // TP
    { predicted_action: "send_discount_offer", actual_action: "no_action_needed" }, // FP for send_discount_offer
    { predicted_action: "no_action_needed", actual_action: "send_discount_offer" }, // FN for send_discount_offer
    { predicted_action: "no_action_needed", actual_action: "no_action_needed" }, // TP for no_action_needed
  ];
  const backtest = computeBacktest(sessions, "test-segment");
  assert.equal(backtest.total, 4);
  assert.equal(backtest.correct, 2);
  assert.equal(backtest.accuracy, 0.5);
  const discountCell = backtest.per_action.find((c) => c.action === "send_discount_offer");
  assert.equal(discountCell.true_positive, 1);
  assert.equal(discountCell.false_positive, 1);
  assert.equal(discountCell.false_negative, 1);
  assert.equal(discountCell.precision, 0.5); // 1/(1+1)
  assert.equal(discountCell.recall, 0.5); // 1/(1+1)
  assert.equal(discountCell.f1, 0.5);
});

test("createRng(): mulberry32 stream is reproducible for the same seed text", () => {
  const a = createRng("test-seed");
  const b = createRng("test-seed");
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  const c = createRng("a-different-seed");
  assert.notDeepEqual(seqA, [c(), c(), c()]);
});

test("generateAllSessions(): deterministic — same seed produces byte-identical output across two runs", () => {
  const runA = generateAllSessions(DEFAULT_DATASET_SEED);
  const runB = generateAllSessions(DEFAULT_DATASET_SEED);
  assert.deepEqual(runA, runB);
  assert.equal(runA.length, 100);
});

test("generateAllSessions(): first session of the fixed seed matches the recorded worked example", () => {
  // Recorded once from a known-good run — regressions here mean the ported
  // RNG/rule/segment order silently drifted from the retired lib/*.ts.
  const sessions = generateAllSessions(DEFAULT_DATASET_SEED);
  const first = sessions[0];
  assert.equal(first.session_id, "price_sensitive_browser-001");
  assert.equal(first.segment_id, "price_sensitive_browser");
  assert.equal(first.session_length, 6.6);
  assert.equal(first.cart_abandon_count, 0);
  assert.equal(first.price_check_count, 13);
  assert.equal(first.days_since_last_visit, 1);
  assert.equal(first.coupon_clicks, 1);
  assert.equal(first.reached_stage, "browse");
  assert.equal(first.predicted_action, "recommend_similar_items");
  assert.equal(first.actual_action, "send_discount_offer");
});

test("computeSessionResult(): recomputes the same predicted_action/triggers as generation for the raw feature fields", () => {
  const sessions = generateAllSessions(DEFAULT_DATASET_SEED);
  const original = sessions[5];
  const row = {
    session_id: original.session_id,
    segment_id: original.segment_id,
    session_length: original.session_length,
    cart_abandon_count: original.cart_abandon_count,
    price_check_count: original.price_check_count,
    days_since_last_visit: original.days_since_last_visit,
    coupon_clicks: original.coupon_clicks,
    reached_stage: original.reached_stage,
    actual_action: original.actual_action,
  };
  const recomputed = computeSessionResult(row);
  assert.equal(recomputed.predicted_action, original.predicted_action);
  assert.deepEqual(recomputed.triggers, original.triggers);
  assert.equal(recomputed.actual_action, original.actual_action);
});

test("computeSessionResult() gives every destructured field a default so a partial row never throws", () => {
  assert.doesNotThrow(() => computeSessionResult());
  assert.doesNotThrow(() => computeSessionResult({ session_id: "x" }));
});

test("buildPredictionSummary(): action_distribution sums to session count and dominant_action is the mode", () => {
  const sessions = [
    { predicted_action: "send_discount_offer", triggers: [] },
    { predicted_action: "send_discount_offer", triggers: [] },
    { predicted_action: "no_action_needed", triggers: [] },
  ];
  const summary = buildPredictionSummary("test-segment", sessions);
  assert.equal(summary.dominant_action, "send_discount_offer");
  assert.equal(
    Object.values(summary.action_distribution).reduce((sum, v) => sum + v, 0),
    3,
  );
  assert.equal(summary.action_distribution.send_discount_offer, 2);
});

test("buildRun(): assembles overall + per-segment funnel/prediction/backtest from the fixed seed sample", () => {
  const sessions = generateAllSessions(DEFAULT_DATASET_SEED);
  const run = buildRun({ sessions, seed: DEFAULT_DATASET_SEED });
  assert.equal(run.seed, DEFAULT_DATASET_SEED);
  assert.equal(run.segments.length, 5);
  assert.equal(run.overall_backtest.total, 100);
  assert.equal(run.overall_backtest.correct, 83);
  assert.equal(run.overall_backtest.accuracy, 0.83);
  assert.equal(run.overall_funnel.stage_counts.browse, 100);
  const priceSensitive = run.segments.find((s) => s.segment_id === "price_sensitive_browser");
  assert.equal(priceSensitive.session_count, 24);
  assert.equal(priceSensitive.backtest.accuracy, 0.833);
});

test("buildSegmentEntry() matches the corresponding entry built by buildRun()", () => {
  const sessions = generateAllSessions(DEFAULT_DATASET_SEED).filter((s) => s.segment_id === "deal_hunter");
  const entry = buildSegmentEntry("deal_hunter", sessions);
  assert.equal(entry.session_count, 20);
  assert.equal(entry.backtest.total, 20);
  assert.ok(NEXT_ACTIONS.includes(entry.prediction_summary.dominant_action));
});

test("computeDecision(): null when no decision recorded, otherwise the normalized shape", () => {
  assert.equal(computeDecision(), null);
  assert.equal(computeDecision({ decision_status: "" }), null);
  assert.deepEqual(computeDecision({ decision_status: "trusted", decision_note: "looks right", decided_at: "t" }), {
    status: "trusted",
    note: "looks right",
    decided_at: "t",
  });
});

test("buildConfigSummary(): falls back to documented defaults when no settings row exists yet", () => {
  const summary = buildConfigSummary([]);
  assert.equal(summary.product_name, "Example Booking Co.");
  assert.equal(summary.vertical, "consumer travel/booking");
  assert.equal(summary.target_precision, 0.6);
  assert.equal(summary.seed, DEFAULT_DATASET_SEED);
  assert.equal(summary.is_example, true);
});

test("buildConfigSummary(): reads product profile from the settings 'config' row", () => {
  const settingsRows = [
    {
      kind: "config",
      payload: JSON.stringify({
        seed: "custom-seed",
        product_name: "Acme Travel",
        vertical: "consumer travel",
        target_precision: 0.7,
      }),
    },
  ];
  const summary = buildConfigSummary(settingsRows);
  assert.equal(summary.product_name, "Acme Travel");
  assert.equal(summary.vertical, "consumer travel");
  assert.equal(summary.target_precision, 0.7);
  assert.equal(summary.seed, "custom-seed");
  assert.equal(summary.is_example, false);
});
