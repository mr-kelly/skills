import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, normalizeDraft, statusForAction } from "../app/js/writer-model.js";

test("buildSnapshot bucket-counts drafts by status and channel", () => {
  const snapshot = buildSnapshot({
    drafts: [
      { draft_id: "d-1", ref: "1", channel: "official_blog", status: "needs_review", title: "Blog" },
      { draft_id: "d-2", ref: "2", channel: "xiaohongshu", status: "approved", title: "XHS" },
      { draft_id: "d-3", ref: "3", channel: "xiaohongshu", status: "blocked", title: "XHS 2" },
      { draft_id: "d-4", ref: "4", channel: "newsletter", status: "done", title: "Newsletter" },
    ],
  });

  assert.equal(snapshot.drafts.length, 4);
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.approved, 1);
  assert.equal(snapshot.metrics.blocked, 1);
  assert.equal(snapshot.metrics.done, 1);
  assert.deepEqual(snapshot.channels, [
    { channel: "newsletter", count: 1 },
    { channel: "official_blog", count: 1 },
    { channel: "xiaohongshu", count: 2 },
  ]);
  // Drafts are ordered by ref ascending regardless of Busabase read order.
  assert.deepEqual(
    snapshot.drafts.map((draft) => draft.draft_id),
    ["d-1", "d-2", "d-3", "d-4"],
  );
});

test("normalizeDraft parses JSON list fields and defaults every property", () => {
  const draft = normalizeDraft({
    draft_id: "d-1",
    hashtags: '["#AI","#Writing"]',
    title_options: "not json",
    source_notes: ["already", "an", "array"],
  });
  assert.deepEqual(draft.hashtags, ["#AI", "#Writing"]);
  assert.deepEqual(draft.title_options, []);
  assert.deepEqual(draft.source_notes, ["already", "an", "array"]);
  assert.equal(draft.status, "needs_review");
  assert.equal(draft.format, "post");
});

test("normalizeDraft never throws when called with no argument", () => {
  const draft = normalizeDraft();
  assert.equal(draft.draft_id, "");
  assert.equal(draft.status, "needs_review");
});

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});
