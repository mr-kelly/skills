import assert from "node:assert/strict";
import test from "node:test";
import { buildBatch, statusForAction } from "../app/js/intel-model.js";

test("buildBatch normalizes fields and computes metrics", () => {
  const batch = buildBatch({
    signals: [{ signal_id: "signal-1", ref: "1", title: "A", status: "needs_review", risk: '["claims-review"]' }],
    actions: [{ action_id: "action-1", ref: "1", title: "B", status: "approved" }],
    drafts: [{ draft_id: "draft-1", ref: "1", channel: "IG caption", status: "blocked" }],
    sources: [{ source_id: "news", label: "News", status: "configured" }],
  });
  assert.equal(batch.signals[0].id, "signal-1");
  assert.deepEqual(batch.signals[0].risk, ["claims-review"]);
  assert.equal(batch.metrics.signals_needs_review, 1);
  assert.equal(batch.metrics.approved, 1);
  assert.equal(batch.metrics.blocked, 1);
  assert.equal(batch.sources[0].label, "News");
});

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});
