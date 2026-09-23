import assert from "node:assert/strict";
import test from "node:test";
import {
  contentHash,
  invalidateTrainingExample,
  splitForSource,
  toTrainingExample,
} from "../scripts/support-qa-bridge.mjs";

const article = { article_id: "kb-one", updated_at: "2026-09-20T00:00:00.000Z" };
const pair = {
  pair_id: "qa-one",
  article_id: "kb-one",
  question: "客户生气时应该怎么办？",
  answer: "先表达理解，再说明可执行的下一步。",
  status: "approved",
  reviewed_by: "kelly",
  updated_at: "2026-09-21T00:00:00.000Z",
};

test("support QA conversion preserves provenance and requires a second review", () => {
  const example = toTrainingExample(pair, article);
  assert.equal(example.example_id, "SUPPORT-qa-one");
  assert.equal(example.task, "support_qa");
  assert.equal(example.status, "needs_review");
  assert.equal(example.source, "kelly-support:kb-one:qa-one");
  assert.match(example.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(["train", "valid", "test"].includes(example.split));
});

test("article edits invalidate older approved pairs", () => {
  const result = toTrainingExample({ ...pair, updated_at: "2026-09-19T00:00:00.000Z" }, article);
  assert.deepEqual(result, { skipped: "stale_pair" });
});

test("downstream invalidation clears approval without losing provenance", () => {
  const existing = { ...toTrainingExample(pair, article), status: "approved", reviewed_at: "2026-09-22" };
  const invalidated = invalidateTrainingExample(existing, "changes_requested", "Source changed");
  assert.equal(invalidated.status, "changes_requested");
  assert.equal(invalidated.reviewed_at, "");
  assert.equal(invalidated.source, "kelly-support:kb-one:qa-one");
  assert.equal(invalidated.content_hash, existing.content_hash);
});

test("hash and source-group split are deterministic", () => {
  assert.equal(contentHash(pair), contentHash({ ...pair }));
  assert.equal(splitForSource("kb-one"), splitForSource("kb-one"));
});
