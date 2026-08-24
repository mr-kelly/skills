import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_SEEDS,
  DEFAULT_RUBRIC,
  VALID_ACTIONS,
  buildBatch,
  buildConfigSummary,
  computeCandidate,
  computeScore,
  deriveBatchAggregates,
  rubricFromConfig,
  rubricFromSettings,
  runMetaFromSettings,
  scoreCategoryRisk,
  scoreGrowth,
  scorePrincipalRatio,
  scoreStability,
  scoreTrackRecord,
  statusForAction,
  suggestedShareRate,
} from "../app/js/scorer-model.js";

test("CANDIDATE_SEEDS: fixed 8-candidate mock queue stays within the candidates Base's readLimit", () => {
  assert.equal(CANDIDATE_SEEDS.length, 8);
  assert.ok(CANDIDATE_SEEDS.every((seed) => seed.monthly_revenue.length >= 6 && seed.monthly_revenue.length <= 12));
});

test("scoreStability(): hand-worked coefficient of variation", () => {
  // avg = 100, stdDev of [90,100,110] = sqrt(((90-100)^2+(100-100)^2+(110-100)^2)/3) = sqrt(66.67) = 8.165
  // CV = 8.165/100 = 8.165% -> score = 100 - 8.165 = 91.8 (rounded to 1dp)
  const result = scoreStability([90, 100, 110]);
  assert.equal(result.score, 91.8);
});

test("scoreStability(): zero-variance series scores a perfect 100", () => {
  const result = scoreStability([50000, 50000, 50000, 50000]);
  assert.equal(result.score, 100);
});

test("scoreGrowth(): hand-worked 3-month early vs. late average", () => {
  // first 3mo avg = (10+10+10)/3 = 10, last 3mo avg = (20+20+20)/3 = 20
  // pctChange = (20-10)/10*100 = 100% -> score = clamp(50 + 100*2, 0, 100) = 100
  const result = scoreGrowth([10, 10, 10, 15, 15, 20, 20, 20]);
  assert.equal(result.score, 100);
});

test("scoreGrowth(): flat revenue scores exactly 50 (neutral)", () => {
  const result = scoreGrowth([30000, 30000, 30000, 30000, 30000, 30000]);
  assert.equal(result.score, 50);
});

test("scoreCategoryRisk(): fixed lookup table per DEFAULT_RUBRIC, unknown category falls back to 60", () => {
  assert.equal(scoreCategoryRisk("Education").score, 90);
  assert.equal(scoreCategoryRisk("F&B").score, 50);
  assert.equal(scoreCategoryRisk("Unknown Vertical").score, 60);
});

test("scorePrincipalRatio(): hand-worked piecewise linear bands", () => {
  // avgMonthly = 50000, ratio = 100000/50000 = 2x -> score = 100 - (2/2)*30 = 70
  assert.equal(scorePrincipalRatio(100000, [50000, 50000]).score, 70);
  // ratio = 200000/50000 = 4x -> score = 70 - ((4-2)/2)*30 = 40
  assert.equal(scorePrincipalRatio(200000, [50000, 50000]).score, 40);
  // ratio = 400000/50000 = 8x -> score = 40 - ((8-4)/4)*40 = 0
  assert.equal(scorePrincipalRatio(400000, [50000, 50000]).score, 0);
  // ratio beyond 8x clamps at 0
  assert.equal(scorePrincipalRatio(1000000, [50000, 50000]).score, 0);
});

test("scoreTrackRecord(): hand-worked history+scale blend", () => {
  // 12 months of exactly $50k/mo -> historyScore=100 (60%), scaleScore=100 (40%) -> 100
  const full = scoreTrackRecord(new Array(12).fill(50000));
  assert.equal(full.score, 100);
  // 6 months at $25k/mo -> historyScore=(6/12)*100=50 (60%=30), scaleScore=(25000/50000)*100=50 (40%=20) -> 50
  const half = scoreTrackRecord(new Array(6).fill(25000));
  assert.equal(half.score, 50);
});

test("suggestedShareRate(): linear bounds against DEFAULT_RUBRIC's base range", () => {
  assert.deepEqual(suggestedShareRate(100, DEFAULT_RUBRIC), { min_pct: 6, max_pct: 11 });
  assert.deepEqual(suggestedShareRate(0, DEFAULT_RUBRIC), { min_pct: 8, max_pct: 14 });
});

test("computeScore(): worked example against the first fixed seed candidate (Maple & Thyme Kitchen)", () => {
  const seed = CANDIDATE_SEEDS[0];
  const result = computeScore(seed, DEFAULT_RUBRIC);
  assert.equal(result.factors.length, 5);
  const total = result.factors.reduce((sum, f) => sum + f.contribution, 0);
  assert.equal(result.composite_score, Math.round(total * 10) / 10);
  // Steady, strongly growing revenue and a moderate principal ask -> comfortably high-confidence.
  assert.ok(
    result.composite_score >= DEFAULT_RUBRIC.decision_thresholds.high_confidence_min,
    String(result.composite_score),
  );
});

test("computeScore(): worked example against a declining candidate with red flags (Ember & Oak BBQ)", () => {
  const seed = CANDIDATE_SEEDS[3];
  const result = computeScore(seed, DEFAULT_RUBRIC);
  // Six-month downtrend plus a high principal ask -> materially lower composite than the top candidate.
  const top = computeScore(CANDIDATE_SEEDS[0], DEFAULT_RUBRIC);
  assert.ok(result.composite_score < top.composite_score);
});

test("computeScore() gives every destructured parameter a default so a partial call never throws", () => {
  assert.doesNotThrow(() => computeScore());
  assert.doesNotThrow(() => computeScore({}));
});

test("statusForAction(): ported verbatim decision->status mapping", () => {
  assert.equal(statusForAction("approve_term_sheet"), "approved");
  assert.equal(statusForAction("send_back_for_data"), "changes_requested");
  assert.equal(statusForAction("reject"), "blocked");
  assert.equal(statusForAction(""), "blocked");
});

test("VALID_ACTIONS: exactly the three decision verdicts", () => {
  assert.deepEqual([...VALID_ACTIONS].sort(), ["approve_term_sheet", "reject", "send_back_for_data"]);
});

test("computeCandidate(): normalizes a Busabase row (kebab-normalized to snake_case) into the UI candidate shape", () => {
  const row = {
    candidate_id: "cand-001",
    business_name: "Maple & Thyme Kitchen",
    category: "F&B",
    city: "Austin, TX",
    requested_principal: 180000,
    monthly_revenue: JSON.stringify(CANDIDATE_SEEDS[0].monthly_revenue),
    red_flags: "[]",
    status: "needs_review",
    decision_action: "",
    decision_comment: "",
    decided_at: "",
  };
  const candidate = computeCandidate(row, DEFAULT_RUBRIC);
  assert.equal(candidate.id, "cand-001");
  assert.deepEqual(candidate.monthly_revenue, CANDIDATE_SEEDS[0].monthly_revenue);
  assert.equal(candidate.decision, undefined);
  assert.equal(candidate.score.composite_score, computeScore(CANDIDATE_SEEDS[0], DEFAULT_RUBRIC).composite_score);
});

test("computeCandidate(): carries a recorded decision through to the UI shape", () => {
  const row = {
    candidate_id: "cand-004",
    business_name: "Ember & Oak BBQ",
    category: "F&B",
    city: "Nashville, TN",
    requested_principal: 220000,
    monthly_revenue: JSON.stringify(CANDIDATE_SEEDS[3].monthly_revenue),
    red_flags: JSON.stringify(CANDIDATE_SEEDS[3].red_flags),
    status: "blocked",
    decision_action: "reject",
    decision_comment: "Six-month downtrend.",
    decided_at: "2026-07-01T15:00:00.000Z",
  };
  const candidate = computeCandidate(row, DEFAULT_RUBRIC);
  assert.equal(candidate.status, "blocked");
  assert.deepEqual(candidate.decision, {
    action: "reject",
    comment: "Six-month downtrend.",
    decided_at: "2026-07-01T15:00:00.000Z",
  });
  assert.deepEqual(candidate.red_flags, ["recent_revenue_decline", "six_month_downtrend"]);
});

test("computeCandidate() gives every destructured field a default so a partial row never throws", () => {
  assert.doesNotThrow(() => computeCandidate());
  assert.doesNotThrow(() => computeCandidate({ candidate_id: "x" }));
});

test("deriveBatchAggregates(): hand-worked metrics/distribution over a 4-item mix", () => {
  const items = [
    { status: "needs_review", score: { composite_score: 90 } }, // high
    { status: "changes_requested", score: { composite_score: 60 } }, // review
    { status: "approved", score: { composite_score: 30 } }, // low
    { status: "blocked", score: { composite_score: 78 } }, // exactly high_confidence_min -> high
  ];
  const { metrics, distribution } = deriveBatchAggregates(items, DEFAULT_RUBRIC);
  assert.deepEqual(metrics, { needs_review: 2, approved: 1, done: 0, blocked: 1 });
  assert.equal(distribution.high_confidence, 2);
  assert.equal(distribution.needs_review, 1);
  assert.equal(distribution.low_confidence, 1);
  assert.equal(distribution.average_score, Math.round(((90 + 60 + 30 + 78) / 4) * 10) / 10);
});

test("buildBatch(): assembles the full Batch shape including metadata", () => {
  const items = [{ status: "needs_review", score: { composite_score: 85 } }];
  const batch = buildBatch({ items, batchId: "test-batch", generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(batch.batch_id, "test-batch");
  assert.equal(batch.generated_at, "2026-01-01T00:00:00.000Z");
  assert.equal(batch.source, "kelly-deal-scorer");
  assert.equal(batch.mode, "app-in-skill");
  assert.equal(batch.items.length, 1);
});

test("rubricFromConfig(): falls back to DEFAULT_RUBRIC when no override is set", () => {
  assert.deepEqual(rubricFromConfig({}), DEFAULT_RUBRIC);
});

test("rubricFromConfig(): merges a partial override on top of DEFAULT_RUBRIC", () => {
  const merged = rubricFromConfig({ rubric: { weights: { stability: 0.4 } } });
  assert.equal(merged.weights.stability, 0.4);
  assert.equal(merged.weights.growth, DEFAULT_RUBRIC.weights.growth);
});

test("buildConfigSummary(): documented defaults when no settings row exists yet", () => {
  const summary = buildConfigSummary([]);
  assert.equal(summary.base_currency, "USD");
  assert.deepEqual(summary.rubric.weights, DEFAULT_RUBRIC.weights);
  assert.deepEqual(summary.rubric.decision_thresholds, DEFAULT_RUBRIC.decision_thresholds);
});

test("rubricFromSettings()/runMetaFromSettings(): read the settings 'config'/'run' rows", () => {
  const settingsRows = [
    { kind: "config", payload: JSON.stringify({ base_currency: "EUR", rubric: { weights: { stability: 0.3 } } }) },
    { kind: "run", payload: JSON.stringify({ batch_id: "b-1", generated_at: "2026-01-01T00:00:00.000Z" }) },
  ];
  const rubric = rubricFromSettings(settingsRows);
  assert.equal(rubric.weights.stability, 0.3);
  const run = runMetaFromSettings(settingsRows);
  assert.equal(run.batch_id, "b-1");
  assert.equal(run.generated_at, "2026-01-01T00:00:00.000Z");
});
