import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  assembleSnapshot,
  baseQuestionFields,
  baseReviewFields,
  buildConfigSummary,
  computeMetrics,
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
  demoSnapshot,
  pendingAgentTasks,
  sanitizeObject,
  statusForAction,
} from "../app/js/homework-model.js";

test("statusForAction maps every valid action, ported verbatim from nextStatusForDecision()", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), "needs_review");
  assert.equal(statusForAction(), "needs_review");
});

test("DECISION_ACTIONS matches the retired DecisionAction union and the three review buttons in the UI", () => {
  assert.deepEqual([...DECISION_ACTIONS].sort(), ["approve", "block", "request_changes", "revise"].sort());
});

test("computeMetrics: mistake-book/paper aggregation, worked example reverse-engineered against the retired demo", () => {
  const questions = [{ status: "needs_review" }, { status: "approved" }, { status: "done" }];
  const mistakes = [{ status: "needs_review" }, { status: "changes_requested" }, { status: "done" }];
  const papers = [{ status: "changes_requested" }, { status: "approved" }];
  assert.deepEqual(computeMetrics({ questions, mistakes, papers, mastery_score: 74, questions_analyzed: 18 }), {
    active_questions: 2,
    mistakes_total: 3,
    due_reviews: 2,
    papers_generated: 2,
    mastery_score: 74,
    questions_analyzed: 18,
  });
  // mastery_score/questions_analyzed cannot be recomputed from the visible
  // lists (they are an all-time history) and default to 0 when unset.
  assert.deepEqual(computeMetrics(), {
    active_questions: 0,
    mistakes_total: 0,
    due_reviews: 0,
    papers_generated: 0,
    mastery_score: 0,
    questions_analyzed: 0,
  });
});

test("pendingAgentTasks: derives the retired agent_tasks.json queue from reviews with status changes_requested", () => {
  const reviews = [
    { review_id: "rv-1", target_type: "question", target_id: "q-1", status: "needs_review", ref: 1 },
    {
      review_id: "rv-2",
      target_type: "mistake",
      target_id: "m-1",
      status: "changes_requested",
      ref: 2,
      decision: { comment: "Make it easier.", decided_at: "2026-01-01T00:00:00.000Z" },
    },
    { review_id: "rv-3", target_type: "paper", target_id: "p-1", status: "changes_requested", ref: 3 },
  ];
  const tasks = pendingAgentTasks(reviews);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], {
    task_id: "task-rv-2",
    type: "review_mistake",
    review_id: "rv-2",
    target_id: "m-1",
    ref: 2,
    comment: "Make it easier.",
    requested_at: "2026-01-01T00:00:00.000Z",
    status: "queued",
  });
  assert.equal(tasks[1].type, "revise_paper");
});

test("computeQuestionFromRow/baseQuestionFields round-trip through JSON-encoded tags/explanation", () => {
  const row = baseQuestionFields({
    question_id: "q-1",
    ref: 1,
    title: "763 - 428",
    outcome: "wrong",
    confidence: 0.92,
    tags: ["borrowing", "place value"],
    explanation: { kid_summary: "Close!", steps: ["a", "b"], key_concept: "k", self_check: "s", next_hint: "n" },
  });
  assert.equal(typeof row.tags, "string");
  assert.equal(typeof row.explanation, "string");
  const question = computeQuestionFromRow(row);
  assert.equal(question.question_id, "q-1");
  assert.deepEqual(question.tags, ["borrowing", "place value"]);
  assert.equal(question.explanation.steps.length, 2);
  assert.equal(question.confidence, 0.92);
});

test("computeQuestionFromRow/computeMistakeFromRow/computePaperFromRow/computeReviewFromRow give every field a default", () => {
  assert.doesNotThrow(() => computeQuestionFromRow());
  assert.doesNotThrow(() => computeMistakeFromRow());
  assert.doesNotThrow(() => computePaperFromRow());
  assert.doesNotThrow(() => computeReviewFromRow());
});

test("computeReviewFromRow: assembles a decision object only when decided, and round-trips through baseReviewFields", () => {
  const undecided = computeReviewFromRow({ review_id: "rv-1", risk: JSON.stringify(["child-facing"]) });
  assert.equal(undecided.decision, undefined);
  assert.deepEqual(undecided.risk, ["child-facing"]);

  const decidedRow = {
    review_id: "rv-2",
    decision_action: "approve",
    decision_comment: "Looks good",
    decided_at: "2026-01-01T00:00:00.000Z",
  };
  const decided = computeReviewFromRow(decidedRow);
  assert.deepEqual(decided.decision, {
    action: "approve",
    comment: "Looks good",
    decided_at: "2026-01-01T00:00:00.000Z",
  });
  // Round-trips cleanly back into baseReviewFields() (flat decision_action/
  // decision_comment/decided_at survive alongside the nested convenience
  // object) — this is exactly what submitReview() in busabase-provider.js
  // and execute_decisions.mjs rely on.
  const fields = baseReviewFields({ ...decided, status: "approved" });
  assert.equal(fields.decision_action, "approve");
  assert.equal(fields.status, "approved");
});

test("sanitizeObject: never leaks a secret-shaped value, only whether one is set", () => {
  const sanitized = sanitizeObject({ api_key: "sk-live-123", tone: "warm", cookie_jar: "abc" });
  assert.deepEqual(sanitized, { api_key: true, tone: "warm", cookie_jar: true });
});

test("buildConfigSummary: sanitizes learning_policy/practice_defaults/export, never a raw secret", () => {
  const summary = buildConfigSummary({
    student_profile: { display_name: "Mia", grade: "Grade 4" },
    subjects: ["Math", "Chinese"],
    learning_policy: { tone: "warm", api_key: "sk-live-123" },
  });
  assert.equal(summary.student_profile.display_name, "Mia");
  assert.deepEqual(summary.subjects, ["Math", "Chinese"]);
  assert.equal(summary.learning_policy.api_key, true);
});

test("assembleSnapshot: recomputes metrics and surfaces a no-snapshot warning only when everything is empty", () => {
  const empty = assembleSnapshot();
  assert.equal(empty.questions.length, 0);
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.warnings[0].id, "no-snapshot");

  const withData = assembleSnapshot({ questions: [{ status: "needs_review" }] });
  assert.equal(withData.warnings.length, 0);
  assert.equal(withData.metrics.active_questions, 1);
});

test("demoSnapshot: exact worked example ported verbatim from the retired app/server/demo.ts", () => {
  const en = demoSnapshot("en");
  assert.equal(en.source, "kelly-homework-coach-demo");
  assert.equal(en.profile.display_name, "Mia");
  assert.equal(en.questions.length, 3);
  assert.equal(en.mistakes.length, 3);
  assert.equal(en.papers.length, 2);
  assert.equal(en.review_items.length, 4);
  // Reverse-engineered against the retired demo.ts: mistakes_total/papers_generated
  // equal array length; active_questions/due_reviews equal the not-done count;
  // mastery_score/questions_analyzed are authored (18 questions analyzed
  // all-time, even though only 3 are currently visible).
  assert.deepEqual(en.metrics, {
    active_questions: 2,
    mistakes_total: 3,
    due_reviews: 2,
    papers_generated: 2,
    mastery_score: 74,
    questions_analyzed: 18,
  });
  assert.equal(en.questions[0].explanation.steps.length, 3);

  const zh = demoSnapshot("zh");
  assert.equal(zh.profile.display_name, "晴晴");
  assert.equal(zh.questions[0].title, "763 - 428 退位減法");
});
