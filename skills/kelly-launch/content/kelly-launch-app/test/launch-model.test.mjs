import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, statusForAction } from "../app/js/launch-model.js";

test("buildSnapshot computes the RAMP readiness gate", () => {
  const snapshot = buildSnapshot({
    items: [
      { item_id: "i-1", ref: "1", phase: "research", status: "done", readiness: "SHIP" },
      { item_id: "i-2", ref: "2", phase: "assemble", status: "needs_review", readiness: "FIX" },
      { item_id: "i-3", ref: "3", phase: "mobilize", status: "blocked", readiness: "BLOCK", title: "Blocker" },
    ],
    channels: [{ channel_id: "product_hunt", type: "product_hunt", display_name: "Product Hunt" }],
    runbook: [
      { step_id: "run-02", title: "Second" },
      { step_id: "run-01", title: "First" },
    ],
  });

  assert.equal(snapshot.metrics.item_count, 3);
  assert.equal(snapshot.readiness.verdict, "BLOCK");
  assert.equal(snapshot.readiness.block, 1);
  assert.equal(snapshot.readiness.blockers.length, 1);
  assert.equal(snapshot.readiness.blockers[0].item_id, "i-3");
  // LQS: (1 ship + 1 fix * 0.5) / 3 items = 50%
  assert.equal(snapshot.readiness.lqs, 50);
  assert.equal(snapshot.phase_progress.find((p) => p.phase === "research").done, 1);
  assert.deepEqual(
    snapshot.runbook.map((step) => step.step_id),
    ["run-01", "run-02"],
  );
});

test("buildSnapshot verdict is SHIP with no blockers", () => {
  const snapshot = buildSnapshot({
    items: [{ item_id: "i-1", ref: "1", phase: "research", status: "done", readiness: "SHIP" }],
  });
  assert.equal(snapshot.readiness.verdict, "SHIP");
  assert.equal(snapshot.readiness.lqs, 100);
});

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});
