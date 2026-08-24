import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCORING_CRITERIA,
  STAGES,
  applyNote,
  applyStageMove,
  baseLeadFields,
  buildConfigSummary,
  buildSnapshot,
  computeFunnelSummary,
  normalizeLeadRow,
  scoreLead,
  suggestNextAction,
} from "../app/js/lead-funnel-model.js";

test("scoreLead: a strong-fit lead scores each factor at its full weight", () => {
  // Golden Wok Kitchens from the retired mock pipeline: 18 stores (within the
  // 5-150 ideal band), $640,000/mo (within the $50k-$2M band), food_beverage
  // (medium risk), data verifiable.
  const { score, breakdown } = scoreLead({
    store_count: 18,
    est_monthly_revenue: 640000,
    category: "food_beverage",
    data_verifiable: true,
  });
  assert.equal(score, 30 + 30 + 18 + 15);
  assert.deepEqual(
    breakdown.map((factor) => factor.contribution),
    [30, 30, 18, 15],
  );
  assert.equal(
    breakdown.reduce((sum, factor) => sum + factor.weight, 0),
    100,
  );
});

test("scoreLead: a weak-fit lead scores each factor near the bottom of its band", () => {
  // Bargain Bin Outlet from the retired mock pipeline: single-unit, well
  // below the minimum check size, higher-risk category, not verifiable.
  const { score, breakdown } = scoreLead({
    store_count: 1,
    est_monthly_revenue: 15000,
    category: "retail_discretionary",
    data_verifiable: false,
  });
  assert.equal(score, 10 + 8 + 12 + 5);
  assert.deepEqual(
    breakdown.map((factor) => factor.factor),
    ["chain_size_fit", "revenue_scale_fit", "category_risk", "data_verifiability"],
  );
});

test("scoreLead: honors overridden scoring_criteria", () => {
  const criteria = { ...DEFAULT_SCORING_CRITERIA, low_risk_categories: ["retail_discretionary"] };
  const { breakdown } = scoreLead({ category: "retail_discretionary", data_verifiable: true }, criteria);
  const categoryFactor = breakdown.find((factor) => factor.factor === "category_risk");
  assert.equal(categoryFactor.contribution, 25);
});

test("suggestNextAction: deterministic mapping from score and stage", () => {
  assert.equal(suggestNextAction(90, "rejected"), "closed_no_action");
  assert.equal(suggestNextAction(10, "term_sheet_ready"), "hand_off_to_underwriting");
  assert.equal(suggestNextAction(20, "new"), "flag_for_reject_review");
  assert.equal(suggestNextAction(80, "new"), "advance_to_term_sheet");
  assert.equal(suggestNextAction(60, "new"), "request_data_verification");
  assert.equal(suggestNextAction(60, "data_verified"), "advance_to_scored");
  assert.equal(suggestNextAction(35, "new"), "flag_for_reject_review");
});

test("computeFunnelSummary: per-stage counts and conversion rates over a worked pipeline", () => {
  const leads = [
    { stage: "new", stage_history: [{ from: null, to: "new", at: "t0" }] },
    {
      stage: "data_verified",
      stage_history: [
        { from: null, to: "new", at: "t0" },
        { from: "new", to: "data_verified", at: "t1" },
      ],
    },
    {
      stage: "term_sheet_ready",
      stage_history: [
        { from: null, to: "new", at: "t0" },
        { from: "new", to: "data_verified", at: "t1" },
        { from: "data_verified", to: "scored", at: "t2" },
        { from: "scored", to: "term_sheet_ready", at: "t3" },
      ],
    },
    {
      stage: "rejected",
      stage_history: [
        { from: null, to: "new", at: "t0" },
        { from: "new", to: "rejected", at: "t1" },
      ],
    },
  ];
  const summary = computeFunnelSummary(leads);
  assert.equal(summary.total, 4);
  const byStage = Object.fromEntries(summary.by_stage.map((item) => [item.stage, item]));
  assert.equal(byStage.new.count, 1);
  assert.equal(byStage.data_verified.count, 1);
  assert.equal(byStage.term_sheet_ready.count, 1);
  assert.equal(byStage.rejected.count, 1);
  // All 4 leads reached "new" (100%); 2 reached "data_verified" or further
  // (data_verified + term_sheet_ready leads) = 50%; 1 reached scored/further = 25%.
  assert.equal(byStage.new.conversion_from_new_pct, 100);
  assert.equal(byStage.data_verified.conversion_from_new_pct, 50);
  assert.equal(byStage.scored.conversion_from_new_pct, 25);
  assert.equal(byStage.term_sheet_ready.conversion_from_new_pct, 25);
  assert.equal(byStage.rejected.conversion_from_new_pct, 25);
  assert.equal(summary.overall_conversion_pct, 25);
  assert.equal(summary.rejection_rate_pct, 25);
});

test("computeFunnelSummary: empty pipeline is all zeros, not NaN/division errors", () => {
  const summary = computeFunnelSummary([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.overall_conversion_pct, 0);
  assert.equal(summary.rejection_rate_pct, 0);
  assert.ok(summary.by_stage.every((item) => item.count === 0 && item.conversion_from_new_pct === 0));
  assert.deepEqual(
    summary.by_stage.map((item) => item.stage),
    STAGES,
  );
});

test("normalizeLeadRow parses JSON array fields and coerces types", () => {
  const lead = normalizeLeadRow({
    lead_id: "lead-001",
    brand_name: "Golden Wok Kitchens",
    store_count: 18,
    est_monthly_revenue: 640000,
    data_verifiable: "true",
    notes: '[{"id":"note-1","text":"hi","author":"ops","created_at":"t0"}]',
    stage_history: '[{"from":null,"to":"new","at":"t0"}]',
  });
  assert.equal(lead.store_count, 18);
  assert.equal(lead.est_monthly_revenue, 640000);
  assert.equal(lead.data_verifiable, true);
  assert.equal(lead.notes.length, 1);
  assert.equal(lead.stage_history.length, 1);
});

test("normalizeLeadRow tolerates malformed JSON without throwing", () => {
  const lead = normalizeLeadRow({ lead_id: "lead-x", notes: "{not json", stage_history: undefined });
  assert.deepEqual(lead.notes, []);
  assert.deepEqual(lead.stage_history, []);
});

test("buildSnapshot attaches score/score_breakdown/suggested_action and rolls up the summary", () => {
  const leads = [
    normalizeLeadRow({
      lead_id: "lead-001",
      brand_name: "Golden Wok Kitchens",
      category: "food_beverage",
      store_count: 18,
      est_monthly_revenue: 640000,
      data_verifiable: "true",
      stage: "term_sheet_ready",
    }),
  ];
  const snapshot = buildSnapshot({ leads });
  assert.equal(snapshot.leads[0].score, 93);
  assert.equal(snapshot.leads[0].suggested_action, "hand_off_to_underwriting");
  assert.equal(snapshot.summary.total, 1);
});

test("buildSnapshot marks rejected leads closed_no_action even at a high score", () => {
  const leads = [
    normalizeLeadRow({
      lead_id: "lead-002",
      store_count: 18,
      est_monthly_revenue: 640000,
      category: "food_beverage",
      data_verifiable: "true",
      stage: "rejected",
      rejection_reason: "Owner declined to share financials.",
    }),
  ];
  const snapshot = buildSnapshot({ leads });
  assert.equal(snapshot.leads[0].suggested_action, "closed_no_action");
});

test("baseLeadFields round-trips through normalizeLeadRow", () => {
  const lead = {
    id: "lead-003",
    brand_name: "Test Co",
    category: "services",
    city: "Austin",
    store_count: 5,
    est_monthly_revenue: 100000,
    lead_source: "referral",
    data_verifiable: true,
    stage: "scored",
    rejection_reason: undefined,
    notes: [{ id: "note-1", text: "hi", author: "ops", created_at: "t0" }],
    stage_history: [{ from: "new", to: "scored", at: "t1" }],
    created_at: "t0",
    updated_at: "t1",
  };
  const fields = baseLeadFields(lead);
  assert.equal(fields.lead_id, "lead-003");
  assert.equal(fields.data_verifiable, "true");
  const roundTripped = normalizeLeadRow(fields);
  assert.equal(roundTripped.id, lead.id);
  assert.equal(roundTripped.data_verifiable, true);
  assert.deepEqual(roundTripped.notes, lead.notes);
  assert.deepEqual(roundTripped.stage_history, lead.stage_history);
});

test("applyStageMove appends stage_history and sets rejection_reason only when rejecting", () => {
  const lead = { id: "lead-004", stage: "new", stage_history: [], rejection_reason: undefined };
  const moved = applyStageMove(lead, "data_verified", "", "2026-07-01T00:00:00.000Z");
  assert.equal(moved.stage, "data_verified");
  assert.equal(moved.stage_history.length, 1);
  assert.equal(moved.stage_history[0].from, "new");
  assert.equal(moved.rejection_reason, undefined);

  const rejected = applyStageMove(moved, "rejected", "No fit", "2026-07-02T00:00:00.000Z");
  assert.equal(rejected.stage, "rejected");
  assert.equal(rejected.rejection_reason, "No fit");
  assert.equal(rejected.stage_history.length, 2);

  // Moving off "rejected" clears the reason again.
  const revived = applyStageMove(rejected, "new", "", "2026-07-03T00:00:00.000Z");
  assert.equal(revived.rejection_reason, undefined);
});

test("applyNote appends a note without mutating the original array", () => {
  const lead = { id: "lead-005", notes: [] };
  const noted = applyNote(lead, "Good call with the owner.", "operator", "2026-07-01T00:00:00.000Z");
  assert.equal(noted.notes.length, 1);
  assert.equal(noted.notes[0].text, "Good call with the owner.");
  assert.equal(noted.notes[0].author, "operator");
  assert.equal(lead.notes.length, 0);
});

test("buildConfigSummary merges scoring_criteria over the defaults", () => {
  const summary = buildConfigSummary({
    fund_profile: { display_name: "Test Fund" },
    scoring_criteria: { ideal_store_count_min: 10 },
  });
  assert.equal(summary.fund_profile.display_name, "Test Fund");
  assert.equal(summary.scoring_criteria.ideal_store_count_min, 10);
  assert.equal(summary.scoring_criteria.ideal_store_count_max, DEFAULT_SCORING_CRITERIA.ideal_store_count_max);
});

test("buildConfigSummary defaults cleanly from an empty payload", () => {
  const summary = buildConfigSummary();
  assert.deepEqual(summary.fund_profile, {});
  assert.deepEqual(summary.scoring_criteria, DEFAULT_SCORING_CRITERIA);
  assert.equal(summary.base_currency, "USD");
});
