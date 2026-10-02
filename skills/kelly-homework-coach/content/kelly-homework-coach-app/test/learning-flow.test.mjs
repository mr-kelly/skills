import assert from "node:assert/strict";
import test from "node:test";
import {
  baseQuestionFields,
  buildPaperAttempt,
  buildPracticeRequest,
  computeQuestionFromRow,
  normalizePaperItem,
  normalizePracticeDiagram,
} from "../app/js/homework-model.js";

test("practice handoff includes exact source and attachment refs, never signed image URLs", () => {
  const mistake = { mistake_id: "m-fixture", question_id: "q-fixture", analysis: { root_cause: "parent observation" } };
  const question = {
    question_id: "q-fixture",
    prompt_text: "Fixture geometry question",
    original_image: [{ id: "att-fixture", url: "https://s1.busabase.com/image?token=do-not-copy" }],
  };
  const text = buildPracticeRequest(mistake, question, { questionsBaseId: "fixture-base" });
  assert.match(text, /Fixture geometry question/);
  assert.match(text, /att-fixture/);
  assert.match(text, /fixture-base/);
  assert.doesNotMatch(text, /do-not-copy|https:\/\//);
  assert.throws(() => buildPracticeRequest(mistake, { ...question, question_id: "different" }));
});

test("image reads accept attachment JSON but normal question writes never clear attachments", () => {
  const question = computeQuestionFromRow({ question_id: "q", original_image: /** @type {any} */ ('[{"id":"att"}]') });
  assert.equal(question.original_image[0].id, "att");
  assert.equal(Object.hasOwn(baseQuestionFields(question), "original_image"), false);
});

test("structured rectangle diagrams reject incomplete, nonnumeric and unbounded points", () => {
  const points = Object.fromEntries(["A", "B", "C", "D", "E", "G", "H", "Q"].map((label, i) => [label, [i, i + 1]]));
  assert.ok(normalizePracticeDiagram({ points, note: "fixture" }));
  assert.equal(normalizePracticeDiagram({ points: { ...points, Q: [Number.POSITIVE_INFINITY, 0] } }), null);
  assert.equal(normalizePracticeDiagram({ points: { ...points, Q: [0, "markup"] } }), null);
  assert.equal(normalizePracticeDiagram({ points: { ...points, Q: [1001, 0] } }), null);
  assert.equal(normalizePracticeDiagram({ points: {} }), null);
  const item = normalizePaperItem(
    { prompt: "p", answer: "1", explanation: "why", parent_answer: "manual", diagram: { points } },
    0,
  );
  assert.equal(item.explanation, "why");
  assert.equal(item.parent_answer, "manual");
  assert.ok(item.diagram);
});

test("final score does not erase first wrong response or hint-assisted retries", () => {
  const attempt = buildPaperAttempt({ items: [{ prompt: "p", answer: "2" }] }, { 1: "2" }, { 1: 1 }, "fixture-time", {
    1: [
      { given: "1", outcome: "wrong" },
      { given: "2", outcome: "correct" },
    ],
  });
  assert.equal(attempt.correct, 1);
  assert.equal(attempt.results[0].first_given, "1");
  assert.equal(attempt.results[0].first_outcome, "wrong");
  assert.equal(attempt.results[0].answer_history.length, 2);
  assert.equal(attempt.results[0].hints_used, 1);
});
