import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEvaluationVerdict,
  applyExampleVerdict,
  baseExampleFields,
  buildSnapshot,
  compareEvaluations,
  normalizeExample,
  normalizeRun,
  parseJson,
} from "../app/js/lab-model.js";

const EXAMPLE = {
  example_id: "EX-001",
  task: "app_spec",
  prompt: "Build a local model lab.",
  ideal_response: '{"category":"platform"}',
  split: "train",
  status: "needs_review",
  source: "fixture",
  content_hash: "sha256:one",
};

test("normalizeExample preserves the review contract and uses safe defaults", () => {
  assert.deepEqual(normalizeExample(EXAMPLE), {
    ...EXAMPLE,
    review_note: "",
    reviewed_at: "",
    updated_at: "",
    __recordId: undefined,
    __headCommitId: undefined,
  });
  assert.equal(normalizeExample({ split: "unknown", status: "unknown" }).split, "train");
  assert.equal(normalizeExample({ split: "unknown", status: "unknown" }).status, "needs_review");
});

test("applyExampleVerdict maps explicit verdicts to lifecycle states", () => {
  const now = "2026-08-29T00:00:00.000Z";
  assert.equal(applyExampleVerdict(EXAMPLE, "approve", "good", now).status, "approved");
  assert.equal(applyExampleVerdict(EXAMPLE, "request_changes", "fix", now).status, "changes_requested");
  assert.equal(applyExampleVerdict(EXAMPLE, "block", "unsafe", now).status, "blocked");
  assert.throws(() => applyExampleVerdict(EXAMPLE, "skip"), /Unknown example verdict/);
});

test("baseExampleFields strips transport metadata", () => {
  const fields = baseExampleFields({ ...EXAMPLE, __recordId: "record", __headCommitId: "commit" });
  assert.equal(fields.example_id, "EX-001");
  assert.equal("__recordId" in fields, false);
  assert.equal("__headCommitId" in fields, false);
});

test("normalizeRun parses config without throwing on malformed values", () => {
  assert.deepEqual(normalizeRun({ config: '{"iters":80}' }).config, { iters: 80 });
  assert.deepEqual(normalizeRun({ config: "broken" }).config, {});
  assert.deepEqual(parseJson("", { fallback: true }), { fallback: true });
});

test("compareEvaluations pairs baseline and adapter by run", () => {
  const comparisons = compareEvaluations([
    { evaluation_id: "base", run_id: "RUN-1", model_role: "baseline", schema_valid_pct: 50, exact_field_pct: 40 },
    { evaluation_id: "adapter", run_id: "RUN-1", model_role: "adapter", schema_valid_pct: 90, exact_field_pct: 72 },
  ]);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].schema_delta, 40);
  assert.equal(comparisons[0].exact_delta, 32);
});

test("applyEvaluationVerdict records only declared promotion decisions", () => {
  const evaluation = { evaluation_id: "EVAL-1", run_id: "RUN-1", model_role: "adapter" };
  assert.equal(applyEvaluationVerdict(evaluation, "promote", "passes").verdict, "promote");
  assert.throws(() => applyEvaluationVerdict(evaluation, "approve"), /Unknown evaluation verdict/);
});

test("buildSnapshot derives attention counts and never stores aggregate state", () => {
  const snapshot = buildSnapshot({
    examples: [EXAMPLE, { ...EXAMPLE, example_id: "EX-2", status: "approved", split: "valid" }],
    runs: [
      { run_id: "RUN-1", status: "ready", config: "{}" },
      { run_id: "RUN-2", status: "done", config: "{}" },
    ],
    models: [{ model_id: "M-1", status: "candidate" }],
  });
  assert.equal(snapshot.counts.examples, 2);
  assert.equal(snapshot.counts.needs_review, 1);
  assert.equal(snapshot.counts.approved, 1);
  assert.equal(snapshot.counts.valid, 1);
  assert.equal(snapshot.counts.active_runs, 1);
  assert.equal(snapshot.counts.completed_runs, 1);
  assert.equal(snapshot.counts.candidate_models, 1);
});
