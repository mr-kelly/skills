import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../app/js/config.js";
import {
  advanceCheck,
  attentionFor,
  buildSnapshot,
  clarityFor,
  missingForStage,
  nextStage,
  normalizeQuestionRow,
} from "../app/js/ideas-model.js";

const demoProviderModule = "../app/js/providers/demo-provider.js";
const { demoSnapshot } = await import(demoProviderModule);

test("every Base read stays within the Busabase records.list limit", () => {
  for (const base of appConfig.bases) {
    assert.ok(
      Number.isInteger(base.readLimit) && base.readLimit >= 1 && base.readLimit <= 100,
      `${base.key}: ${base.readLimit}`,
    );
  }
});

test("demo snapshots load deterministic workflow scenes", () => {
  const overview = demoSnapshot("overview");
  assert.equal(overview.ideas.length, 4);
  assert.equal(overview.counts.parked, 1);

  const ready = demoSnapshot("ready");
  assert.deepEqual(
    ready.ideas.map((idea) => idea.record_id),
    ["idea-email"],
  );
  assert.equal(ready.ideas[0].documents.prd.status, "已完善");

  const needsAnswer = demoSnapshot("needs-answer");
  assert.ok(needsAnswer.counts.needsAnswer > 0);
});

const vagueIdea = {
  record_id: "idea-1",
  title: "帮人做点什么",
  stage: "idea",
};

const sharpIdea = {
  record_id: "idea-2",
  title: "外贸邮件审批台",
  one_liner: "帮外贸老板在一个界面里批准今天该回的邮件",
  who: "有自己邮箱的小型外贸公司老板",
  problem: "邮件太多，重要的和不重要的混在一起，回复慢丢单",
  why_now: "AI 现在能读懂邮件语义了",
  stage: "brd",
};

test("nextStage walks the ladder and stops at prd", () => {
  assert.equal(nextStage("idea"), "brd");
  assert.equal(nextStage("brd"), "mrd");
  assert.equal(nextStage("mrd"), "prd");
  assert.equal(nextStage("prd"), null);
});

test("a vague idea cannot leave the idea rung", () => {
  const check = advanceCheck(vagueIdea, []);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "missing_fields");
  assert.deepEqual(check.missingFields, ["one_liner", "who"]);
});

test("filling the required fields opens the gate", () => {
  const idea = { ...vagueIdea, one_liner: "一句话", who: "某类人" };
  assert.deepEqual(missingForStage(idea, "idea"), []);
  assert.equal(advanceCheck(idea, []).canAdvance, true);
});

test("an open question blocks advancement even when fields are filled", () => {
  const questions = [{ idea_id: "idea-2", stage: "brd", status: "open", question: "谁已经试过？" }];
  const check = advanceCheck(sharpIdea, questions);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "open_questions");
  assert.equal(check.openQuestions.length, 1);
});

test("a question on another rung does not block this one", () => {
  const questions = [{ idea_id: "idea-2", stage: "mrd", status: "open", question: "定价？" }];
  assert.equal(advanceCheck(sharpIdea, questions).canAdvance, true);
});

test("a parked idea never advances", () => {
  const parked = { ...sharpIdea, status: "已搁置" };
  const check = advanceCheck(parked, []);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "parked");
  assert.equal(attentionFor(parked, []), "parked");
});

test("an emptied answer reopens the question regardless of stored status", () => {
  const row = normalizeQuestionRow({ idea_id: "i", question: "q", answer: "  ", status: "answered" });
  assert.equal(row.status, "open");
});

test("a skipped question stays skipped and does not block", () => {
  const row = normalizeQuestionRow({ idea_id: "idea-2", stage: "brd", question: "q", status: "skipped" });
  assert.equal(row.status, "skipped");
  assert.equal(advanceCheck(sharpIdea, [row]).canAdvance, true);
});

test("clarity rises as the ladder is climbed", () => {
  const vague = clarityFor(vagueIdea, [], []);
  const sharp = clarityFor(sharpIdea, [], []);
  assert.ok(sharp > vague, `expected ${sharp} > ${vague}`);
  assert.ok(vague >= 0 && sharp <= 100);
});

test("buildSnapshot derives counts, attention, and per-kind documents", () => {
  const snapshot = buildSnapshot({
    ideas: [vagueIdea, sharpIdea],
    documents: [{ record_id: "d1", idea_id: "idea-2", kind: "brd", status: "已完善", body: "..." }],
    questions: [{ record_id: "q1", idea_id: "idea-1", stage: "idea", question: "给谁用？", position: 1 }],
  });

  assert.equal(snapshot.counts.total, 2);
  assert.equal(snapshot.counts.needsAnswer, 1);
  assert.equal(snapshot.counts.readyForAgent, 1);

  const vague = snapshot.ideas.find((i) => i.record_id === "idea-1");
  assert.equal(vague.attention, "needs_answer");
  assert.equal(vague.open_questions, 1);

  const sharp = snapshot.ideas.find((i) => i.record_id === "idea-2");
  assert.equal(sharp.documents.brd.status, "已完善");
  assert.equal(sharp.documents.mrd, null);
  assert.equal(sharp.attention, "ready_for_agent");
});

test("derived clarity overrides a stale stored score", () => {
  const snapshot = buildSnapshot({ ideas: [{ ...vagueIdea, clarity: 99 }] });
  assert.notEqual(snapshot.ideas[0].clarity, 99);
});
