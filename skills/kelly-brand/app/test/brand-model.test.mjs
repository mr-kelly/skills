import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot, driftStatusForAction, overallGate, statusForAction } from "../app/js/brand-model.js";

function row(overrides = {}) {
  return {
    item_id: "item-1",
    ref: 1,
    type: "message_pillar",
    phase: "architect",
    sub_skill: "message-system-architect",
    title: "Pillar",
    draft: "Draft body",
    reason: "",
    status: "needs_review",
    created_at: "2026-01-01T00:00:00.000Z",
    decision_note: "",
    decided_at: "",
    ...overrides,
  };
}

test("statusForAction maps every decision verb to a workflow status", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("nonsense"), null);
});

test("driftStatusForAction maps drift verdicts", () => {
  assert.equal(driftStatusForAction("resolve_drift"), "resolved");
  assert.equal(driftStatusForAction("dismiss_drift"), "dismissed");
  assert.equal(driftStatusForAction("approve"), null);
});

test("overallGate follows the SHIP >=80 / FIX >=55 / BLOCK threshold rule", () => {
  assert.equal(overallGate(100), "SHIP");
  assert.equal(overallGate(80), "SHIP");
  assert.equal(overallGate(79), "FIX");
  assert.equal(overallGate(55), "FIX");
  assert.equal(overallGate(54), "BLOCK");
  assert.equal(overallGate(0), "BLOCK");
});

test("buildSnapshot: overall_nqs is the rounded mean across scored items only", () => {
  const items = [
    row({ item_id: "a", nqs_score: 88, nqs_gate: "SHIP" }),
    row({ item_id: "b", nqs_score: 79, nqs_gate: "SHIP" }),
    row({ item_id: "c", nqs_score: 64, nqs_gate: "FIX" }),
    // No nqs_score at all — must not count toward the mean or the divisor.
    row({ item_id: "d" }),
  ];
  const snapshot = buildSnapshot({ items, driftAlerts: [] });
  // (88 + 79 + 64) / 3 = 77
  assert.equal(snapshot.metrics.overall_nqs, 77);
  assert.equal(snapshot.metrics.item_count, 4);
});

test("buildSnapshot: worked example matches the Fernpath positioning/pillar/story/proof-point mix", () => {
  const items = [
    row({ item_id: "positioning-core", ref: 1, type: "positioning", draft: "For independents...", status: "approved" }),
    row({ item_id: "pillar-provenance", ref: 2, type: "message_pillar", status: "approved" }),
    row({ item_id: "pillar-same-day", ref: 3, type: "message_pillar", status: "needs_review" }),
    row({ item_id: "story-marisol", ref: 4, type: "story", status: "changes_requested" }),
    row({
      item_id: "proof-time-to-table",
      ref: 5,
      type: "proof_point",
      status: "approved",
      evidence_source: "Fernpath internal logistics data",
      evidence_stat: "Q2 2026 platform report",
      evidence_url: "https://fernpath.example/data",
    }),
    row({ item_id: "proof-waste-claim", ref: 6, type: "proof_point", status: "blocked", risk: ["claim"] }),
  ];
  const snapshot = buildSnapshot({ items, driftAlerts: [] });

  assert.equal(snapshot.positioning.statement, "For independents...");
  assert.equal(snapshot.positioning.item_id, "positioning-core");
  assert.equal(snapshot.metrics.canonical_count, 3); // positioning-core, pillar-provenance, proof-time-to-table
  assert.equal(snapshot.metrics.needs_review_count, 1); // pillar-same-day
  assert.equal(snapshot.metrics.pillar_count, 2);
  assert.equal(snapshot.metrics.story_count, 1);
  assert.equal(snapshot.metrics.proof_point_count, 2);

  const backed = snapshot.items.find((entry) => entry.item_id === "proof-time-to-table");
  assert.deepEqual(backed.evidence, {
    source: "Fernpath internal logistics data",
    stat: "Q2 2026 platform report",
    url: "https://fernpath.example/data",
  });

  const unbacked = snapshot.items.find((entry) => entry.item_id === "proof-waste-claim");
  assert.equal(unbacked.evidence, null);
  assert.deepEqual(unbacked.risk, ["claim"]);
});

test("buildSnapshot: drift_open_count counts only open alerts, resolved/dismissed drop out", () => {
  const driftAlerts = [
    { alert_id: "d1", status: "open", severity: "high" },
    { alert_id: "d2", status: "open", severity: "medium" },
    { alert_id: "d3", status: "resolved", severity: "high" },
    { alert_id: "d4", status: "dismissed", severity: "low" },
  ];
  const snapshot = buildSnapshot({ items: [], driftAlerts });
  assert.equal(snapshot.metrics.drift_open_count, 2);
  assert.equal(snapshot.drift_alerts.length, 4);
});

test("buildSnapshot: risk survives as a JSON-text field (Busabase text type) or a plain array (demo)", () => {
  const jsonText = buildSnapshot({ items: [row({ item_id: "a", risk: '["claim","money"]' })], driftAlerts: [] });
  assert.deepEqual(jsonText.items[0].risk, ["claim", "money"]);

  const plainArray = buildSnapshot({ items: [row({ item_id: "a", risk: ["claim"] })], driftAlerts: [] });
  assert.deepEqual(plainArray.items[0].risk, ["claim"]);

  const missing = buildSnapshot({ items: [row({ item_id: "a", risk: undefined })], driftAlerts: [] });
  assert.deepEqual(missing.items[0].risk, []);
});

test("buildSnapshot: an unscored item does not get a nqs object", () => {
  const snapshot = buildSnapshot({ items: [row({ item_id: "a", nqs_score: undefined })], driftAlerts: [] });
  assert.equal(snapshot.items[0].nqs, null);
});
