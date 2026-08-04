import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECISION_ACTIONS,
  PIPELINE_STAGES,
  buildSnapshot,
  calcRoi,
  phaseForStage,
  statusForAction,
} from "../app/js/creators-model.js";

test("statusForAction maps every decision action to its workflow status", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("bogus"), null);
  assert.equal(statusForAction(), null);
});

test("phaseForStage maps each pipeline stage onto its Discover/Plan/Activate/Measure phase", () => {
  assert.equal(phaseForStage("discovery"), "discover");
  assert.equal(phaseForStage("outreach"), "activate");
  assert.equal(phaseForStage("negotiating"), "plan");
  assert.equal(phaseForStage("live"), "activate");
  assert.equal(phaseForStage("measured"), "measure");
  assert.equal(phaseForStage("unknown"), "discover");
  assert.equal(phaseForStage(), "discover");
});

test("calcRoi matches the retired renderRoi() inline formula", () => {
  // Worked example from the retired demo.ts: Jade Kim, $2,000 spend, $8,200
  // est_value -> ((8200 / 2000) - 1) * 100 = 310%.
  assert.ok(Math.abs(calcRoi(2000, 8200) - 310) < 1e-9);
  // No spend yet: the view renders an em dash instead of a percentage.
  assert.equal(calcRoi(0, 500), null);
  assert.equal(calcRoi(700, 3100), (3100 / 700 - 1) * 100);
});

test("PIPELINE_STAGES and DECISION_ACTIONS match the schema doc's enums", () => {
  assert.deepEqual(PIPELINE_STAGES, ["discovery", "outreach", "negotiating", "live", "measured"]);
  assert.deepEqual(DECISION_ACTIONS, ["approve", "request_changes", "block", "revise"]);
});

test("buildSnapshot computes cpm, phase, and the same rollups as the retired demo.ts", () => {
  const snapshot = buildSnapshot({
    creators: [
      // Worked example from the retired demo.ts: Lena Ortiz, $1,800 est_rate
      // over 184,000 followers -> cpm = (1800/184000)*1000 rounded to 2dp = 9.78.
      {
        creator_id: "cr-lena-glow",
        ref: 1,
        item_type: "engagement",
        stage: "outreach",
        status: "needs_review",
        followers: 184000,
        est_rate: 1800,
        est_value: 5200,
      },
      {
        creator_id: "cr-yuki-asmr",
        ref: 12,
        item_type: "engagement",
        stage: "live",
        status: "approved",
        followers: 71000,
        est_rate: 700,
        est_value: 3100,
        spend: 700,
      },
      {
        creator_id: "cr-priya-ritual",
        ref: 7,
        item_type: "engagement",
        stage: "discovery",
        status: "blocked",
        followers: 1240000,
        est_rate: 12000,
        est_value: 0,
      },
      // Quality-gate item: counted in needs_review/approved/done/blocked but
      // excluded from creator_count/total_reach/budget_allocated/est_value.
      {
        creator_id: "cr-jade-gate",
        ref: 15,
        item_type: "quality_gate",
        stage: "live",
        status: "needs_review",
        followers: 128000,
        est_rate: 0,
        est_value: 0,
      },
    ],
  });

  assert.equal(snapshot.creators.find((c) => c.creator_id === "cr-lena-glow").cpm, 9.78);
  assert.equal(snapshot.creators.find((c) => c.creator_id === "cr-lena-glow").phase, "activate");
  assert.equal(snapshot.creators.find((c) => c.creator_id === "cr-priya-ritual").phase, "discover");

  // creator_count/total_reach exclude the quality-gate row.
  assert.equal(snapshot.metrics.creator_count, 3);
  assert.equal(snapshot.metrics.total_reach, 184000 + 71000); // blocked creator excluded too
  // needs_review/approved/blocked include the quality-gate row's status.
  assert.equal(snapshot.metrics.needs_review, 2);
  assert.equal(snapshot.metrics.approved, 1);
  assert.equal(snapshot.metrics.blocked, 1);
  // budget_allocated sums est_rate over approved/done/live-status engagements.
  assert.equal(snapshot.metrics.budget_allocated, 700);
  // est_value sums over engagements only.
  assert.equal(snapshot.metrics.est_value, 5200 + 3100 + 0);
});

test("buildSnapshot defaults every destructured field so malformed rows never throw", () => {
  const snapshot = buildSnapshot({ creators: [{}] });
  assert.equal(snapshot.creators.length, 1);
  assert.equal(snapshot.creators[0].item_type, "engagement");
  assert.equal(snapshot.creators[0].status, "needs_review");
  assert.equal(snapshot.creators[0].stage, "discovery");
  assert.deepEqual(snapshot.creators[0].risk, []);
  assert.deepEqual(snapshot.creators[0].fit_breakdown, {});
  assert.deepEqual(snapshot.creators[0].gate_checks, []);
  // buildSnapshot() itself defaults creators to [] when omitted entirely.
  const empty = buildSnapshot();
  assert.equal(empty.creators.length, 0);
  assert.equal(empty.metrics.creator_count, 0);
});

test("buildSnapshot parses JSON-encoded fit_breakdown/risk/gate_checks strings (Busabase text fields)", () => {
  const snapshot = buildSnapshot({
    creators: [
      {
        creator_id: "cr-mateo-derm",
        ref: 2,
        item_type: "engagement",
        risk: '["money"]',
        fit_breakdown: '{"content":90,"credibility":98}',
        gate_checks: "not-json",
      },
    ],
  });
  const row = snapshot.creators[0];
  assert.deepEqual(row.risk, ["money"]);
  assert.deepEqual(row.fit_breakdown, { content: 90, credibility: 98 });
  assert.deepEqual(row.gate_checks, []);
});
