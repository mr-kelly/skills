import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  aggregateTotals,
  aiVisibilityScore,
  badgesFor,
  entityReadinessScore,
  evaluateGeoGate,
  expectedCtr,
  geoEffectiveStatus,
  operationForOpportunity,
  ratio,
  round1,
  statusForVerdict,
  sumTotals,
} from "../app/js/seo-model.js";

test("statusForVerdict maps every decision action, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "revise" only edits the draft/note: status stays whatever it was.
  assert.equal(statusForVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("revise", "approved"), "approved");
  assert.deepEqual([...DECISION_ACTIONS], ["approve", "request_changes", "revise", "block"]);
});

test("badgesFor: striking_distance for position 8-15, low_ctr for CTR well under the expected curve", () => {
  // Position 9.2, 4900 impressions, 96 clicks (the release-notes-vs-changelog demo query).
  assert.deepEqual(badgesFor(96, 4900, 9.2), ["striking_distance"]);
  // Below the curve: expectedCtr(9.2) = 0.03, threshold = 0.018; 40/1000 = 0.04 (2.2%) < 1.8% is false here,
  // use a clearly-under-threshold example instead.
  assert.deepEqual(badgesFor(10, 1000, 9.2), ["striking_distance", "low_ctr"]);
  // High position with strong CTR: no badges.
  assert.deepEqual(badgesFor(500, 1000, 2), []);
});

test("expectedCtr follows the position curve, highest near position 1", () => {
  assert.equal(expectedCtr(1), 0.28);
  assert.equal(expectedCtr(4), 0.07);
  assert.equal(expectedCtr(9), 0.03);
  assert.equal(expectedCtr(25), 0.008);
});

test("sumTotals/aggregateTotals: impression-weighted average position, worked example", () => {
  const sites = [
    { clicks: 3480, impressions: 68400, position: 7.4 },
    { clicks: 610, impressions: 6900, position: 5.2 },
  ];
  const totals = sumTotals(sites);
  assert.equal(totals.clicks, 4090);
  assert.equal(totals.impressions, 75300);
  // weighted = 68400*7.4 + 6900*5.2 = 506160 + 35880 = 542040; /75300 = 7.196... -> round1 = 7.2
  assert.equal(totals.position, 7.2);
  assert.equal(totals.ctr, ratio(4090, 75300));

  const aggregated = aggregateTotals(sites);
  assert.equal(aggregated.clicks, 4090);
  assert.ok(Math.abs(aggregated.position - 7.196) < 0.01);
});

test("ratio/round1 numeric helpers", () => {
  assert.equal(ratio(50, 1000), 0.05);
  assert.equal(ratio(0, 0), 0);
  assert.equal(round1(7.1961), 7.2);
});

test("evaluateGeoGate: BLOCKs an ungrounded bare stat in the draft (the Headway migration-stats demo item)", () => {
  const gate = evaluateGeoGate({
    draft: "94% of migrations complete on the first import with zero data loss.",
    claims: [{ text: "94% of migrations complete on the first import", source: "" }],
    has_schema: false,
    has_qa_block: false,
  });
  assert.equal(gate.verdict, "BLOCK");
  const grounding = gate.checks.find((check) => check.id === "factual-grounding");
  assert.equal(grounding.result, "fail");
});

test("evaluateGeoGate: FIXes a clean draft with no Q&A block or schema", () => {
  const gate = evaluateGeoGate({
    draft: "Release notes and a changelog answer two different questions.",
    claims: [],
    has_schema: true,
    has_qa_block: false,
  });
  assert.equal(gate.verdict, "FIX");
  assert.equal(gate.score, 85); // 100 - 1 warn * 15
});

test("evaluateGeoGate: SHIPs when grounded, with a Q&A block and schema", () => {
  const gate = evaluateGeoGate({
    draft: "## Is Featherlog a good changelog tool?\n\nYes.",
    claims: [],
    has_schema: true,
    has_qa_block: true,
  });
  assert.equal(gate.verdict, "SHIP");
  assert.equal(gate.score, 100);
});

test("evaluateGeoGate: every destructured param has a default (no-arg call does not throw)", () => {
  const gate = evaluateGeoGate();
  // No draft/claims -> grounded; no qa block/schema -> two warns -> FIX.
  assert.equal(gate.verdict, "FIX");
  assert.equal(gate.checks.length, 3);
});

test("geoEffectiveStatus: a geo-qa BLOCK overrides an approved status unless the change is executed", () => {
  assert.equal(geoEffectiveStatus({ status: "approved", gate: { verdict: "BLOCK" }, execution: null }), "blocked");
  assert.equal(
    geoEffectiveStatus({ status: "approved", gate: { verdict: "BLOCK" }, execution: { status: "executed" } }),
    "done",
  );
  assert.equal(
    geoEffectiveStatus({ status: "needs_review", gate: { verdict: "FIX" }, execution: null }),
    "needs_review",
  );
});

test("entityReadinessScore: present=1, partial=0.5, missing=0, worked example (4/6 demo signals)", () => {
  const signals = [
    { status: "missing" },
    { status: "missing" },
    { status: "present" },
    { status: "partial" },
    { status: "partial" },
    { status: "present" },
  ];
  // (0 + 0 + 1 + 0.5 + 0.5 + 1) / 6 = 3/6 = 0.5 -> 50
  assert.equal(entityReadinessScore(signals), 50);
  assert.equal(entityReadinessScore([]), 0);
});

test("aiVisibilityScore: share of engine x prompt cells that mention the brand", () => {
  const prompts = [
    { mentions: [{ mentioned: true }, { mentioned: true }, { mentioned: false }] },
    { mentions: [{ mentioned: false }, { mentioned: false }, { mentioned: false }] },
  ];
  // 2 mentioned out of 6 cells = 33%
  assert.equal(aiVisibilityScore(prompts, ["a", "b", "c"]), 33);
  assert.equal(aiVisibilityScore([], []), 0);
});

test("operationForOpportunity: maps type to operation, dry-run vs apply status/detail", () => {
  const opportunity = { type: "title_meta_rewrite", target_page: "https://example.com/pricing", ref: 2 };
  const dryRun = operationForOpportunity(opportunity);
  assert.equal(dryRun.operation, "rewrite_title");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.detail, /Dry run/);

  const applied = operationForOpportunity(opportunity, { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /Approved/);

  const noTarget = operationForOpportunity({ type: "content_brief" });
  assert.equal(noTarget.status, "blocked");
  assert.equal(noTarget.target, "");
});
