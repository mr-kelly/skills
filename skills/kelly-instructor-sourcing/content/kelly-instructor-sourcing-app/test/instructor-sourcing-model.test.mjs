import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConnectedFields,
  buildCriteriaFields,
  buildDecisionFields,
  buildScoreFields,
  buildWechatAddedFields,
  computeOverallScore,
  createInstructorSourcingDesk,
  missingCriteriaRequirements,
  nextStep,
  normalizeCriteria,
  qualifies,
  scoreBucket,
  scoreBucketLabel,
  statusLabel,
} from "../app/js/instructor-sourcing-model.js";

const record = (id, baseKey, fields) => ({ id, baseKey, fields });
const criteriaRecord = record("criteria-self", "criteria", {
  role_keywords: "财务 讲师",
  qualify_threshold: 75,
});
const sample = [
  criteriaRecord,
  record("candidate-a", "candidates", {
    name: "王建国",
    endorsement_score: 82,
    expertise_score: 88,
    teaching_score: 79,
    overall_score: 83,
    status: "qualified",
  }),
  record("candidate-b", "candidates", {
    name: "张伟",
    endorsement_score: 90,
    expertise_score: 84,
    teaching_score: 88,
    overall_score: 87,
    status: "connected",
    wechat_added_at: "2026-08-02",
    logged_at: "2026-08-03",
  }),
  record("candidate-c", "candidates", {
    name: "陈晨",
    status: "screening",
  }),
  record("candidate-d", "candidates", {
    name: "孙丽",
    endorsement_score: 77,
    expertise_score: 71,
    teaching_score: 76,
    status: "screening",
  }),
];

test("sorts candidates by status priority then overall score", () => {
  const desk = createInstructorSourcingDesk(sample);
  assert.deepEqual(
    desk.candidates.map((candidate) => [candidate.ref, candidate.name]),
    [
      ["#1", "孙丽"],
      ["#2", "陈晨"],
      ["#3", "王建国"],
      ["#4", "张伟"],
    ],
  );
});

test("buckets candidates by status and tracks attention counts", () => {
  const desk = createInstructorSourcingDesk(sample);
  assert.equal(desk.counts.all, 4);
  assert.equal(desk.counts.qualified, 1);
  assert.equal(desk.counts.connected, 1);
  assert.equal(desk.attention.screening, 2);
  assert.equal(desk.attention.readyToDecide, 1); // 孙丽 has all three scores
  assert.equal(desk.attention.awaitingWechatRecord, 1); // 王建国 is qualified, no wechat-added-at yet
});

test("onboarding requires only search keywords and the qualify threshold", () => {
  assert.deepEqual(normalizeCriteria(undefined).missing, ["搜索关键词", "合格分数线"]);
  assert.deepEqual(missingCriteriaRequirements({ roleKeywords: "财务 讲师" }), ["合格分数线"]);
  assert.equal(normalizeCriteria(criteriaRecord).ready, true);
});

test("criteria writes use the declared schema", () => {
  assert.deepEqual(
    buildCriteriaFields(
      { roleKeywords: " 财务 讲师 ", qualifyThreshold: "75", endorsementRubric: "背书证据充分" },
      "2026-08-12",
      { onboardingVersion: 1 },
    ),
    {
      "role-keywords": "财务 讲师",
      "experience-filter": "",
      "activity-filter": "",
      "endorsement-rubric": "背书证据充分",
      "expertise-rubric": "",
      "teaching-rubric": "",
      "qualify-threshold": 75,
      "updated-at": "2026-08-12",
      "onboarding-version": 1,
    },
  );
});

test("overall score is the mean of the three axes, rounded", () => {
  assert.equal(computeOverallScore(82, 88, 79), 83);
  assert.equal(computeOverallScore(0, 0, 0), 0);
  assert.equal(computeOverallScore(70, 71, 71), 71);
});

test("score buckets and labels are consistent", () => {
  assert.equal(scoreBucket(90), "high");
  assert.equal(scoreBucket(75), "mid");
  assert.equal(scoreBucket(40), "low");
  assert.equal(scoreBucketLabel(90), "优秀");
  assert.equal(scoreBucketLabel(75), "达标");
  assert.equal(scoreBucketLabel(40), "待观察");
});

test("qualifies compares the overall score against the criteria threshold", () => {
  assert.equal(qualifies({ overallScore: 83 }, 75), true);
  assert.equal(qualifies({ overallScore: 60 }, 75), false);
  assert.equal(qualifies({ overallScore: 90 }, 0), false); // no threshold set yet
});

test("a screening→decision transition requires all three scores and stays a one-way door", () => {
  const desk = createInstructorSourcingDesk(sample);
  const chen = desk.candidates.find((candidate) => candidate.name === "陈晨");
  const sun = desk.candidates.find((candidate) => candidate.name === "孙丽");
  const wang = desk.candidates.find((candidate) => candidate.name === "王建国");
  assert.throws(() => buildDecisionFields(chen, "qualified", "2026-08-12"), /MISSING_SCORES/);
  assert.deepEqual(buildDecisionFields(sun, "qualified", "2026-08-12"), { status: "qualified" });
  assert.deepEqual(buildDecisionFields(sun, "not-qualified", "2026-08-12"), {
    status: "not-qualified",
    "logged-at": "2026-08-12",
  });
  assert.throws(() => buildDecisionFields(wang, "qualified", "2026-08-12"), /ALREADY_DECIDED/);
});

test("a WeChat add can only be recorded for a qualified candidate, and connecting requires it first", () => {
  const desk = createInstructorSourcingDesk(sample);
  const wang = desk.candidates.find((candidate) => candidate.name === "王建国"); // qualified, no wechat yet
  const chen = desk.candidates.find((candidate) => candidate.name === "陈晨"); // screening
  assert.throws(() => buildWechatAddedFields(chen, "2026-08-12"), /NOT_QUALIFIED/);
  assert.throws(() => buildWechatAddedFields(wang, ""), /MISSING_DATE/);
  assert.deepEqual(buildWechatAddedFields(wang, "2026-08-12"), { "wechat-added-at": "2026-08-12" });
  assert.throws(() => buildConnectedFields(wang, "2026-08-13"), /MISSING_WECHAT_ADD/);
  const wangWithWechat = { ...wang, wechatAddedAt: "2026-08-12" };
  assert.deepEqual(buildConnectedFields(wangWithWechat, "2026-08-13"), {
    status: "connected",
    "logged-at": "2026-08-13",
  });
});

test("score fields are derived consistently for a save", () => {
  assert.deepEqual(
    buildScoreFields({ endorsementScore: 80, expertiseScore: 70, teachingScore: 90, matchNotes: " 有依据 " }),
    {
      "endorsement-score": 80,
      "expertise-score": 70,
      "teaching-score": 90,
      "overall-score": 80,
      "match-notes": "有依据",
    },
  );
});

test("nextStep gives per-candidate guidance, not desk-wide guidance", () => {
  const desk = createInstructorSourcingDesk(sample);
  const chen = desk.candidates.find((candidate) => candidate.name === "陈晨");
  const sun = desk.candidates.find((candidate) => candidate.name === "孙丽");
  const wang = desk.candidates.find((candidate) => candidate.name === "王建国");
  const zhang = desk.candidates.find((candidate) => candidate.name === "张伟");
  assert.equal(nextStep(chen).command, "/kelly-instructor-sourcing review");
  assert.equal(nextStep(sun).command, "");
  assert.equal(nextStep(sun).title, "标记合格或不合格");
  assert.equal(nextStep(wang).title, "人工添加微信后回来记录");
  assert.equal(nextStep({ ...wang, wechatAddedAt: "2026-08-12" }).title, "标记已建联");
  assert.equal(nextStep(zhang), null); // connected candidates have no further step
  assert.equal(nextStep(null), null);
});

test("status labels cover every status", () => {
  assert.equal(statusLabel("screening"), "待筛选");
  assert.equal(statusLabel("qualified"), "已合格");
  assert.equal(statusLabel("not-qualified"), "不合格");
  assert.equal(statusLabel("connected"), "已建联");
});
