import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  buildSnapshot,
  computeComplianceScore,
  computeMetrics,
  deriveActivityLog,
  evaluateCheck,
  evaluateRule,
  isLabLesson,
  normalizePlanRow,
  planExecution,
  planToReviewItem,
  sectionPresent,
  slugify,
  statusForVerdict,
} from "../app/js/lesson-model.js";

test("statusForVerdict maps every decision action, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "revise" only edits the draft/note: status stays whatever it was.
  assert.equal(statusForVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("revise", "approved"), "approved");
  assert.deepEqual([...DECISION_ACTIONS], ["approve", "request_changes", "block", "revise"]);
});

test("sectionPresent treats an array as present only when non-empty, and a string by trimmed length", () => {
  const plan = { sections: { objectives: [], homework: "  ", safety_notes: "Wear goggles" } };
  assert.equal(sectionPresent(plan, "objectives"), false);
  assert.equal(sectionPresent(plan, "homework"), false);
  assert.equal(sectionPresent(plan, "safety_notes"), true);
});

test("isLabLesson matches whole ASCII words but plain substrings for CJK keywords", () => {
  const labByTitle = { title: "Ohm's Law Lab", unit: "", sections: { materials: [], stages: [] } };
  assert.equal(isLabLesson(labByTitle, ["lab", "experiment", "实验"]), true);
  const labeledButNotLab = { title: "Reading a food Label", unit: "", sections: { materials: [], stages: [] } };
  assert.equal(isLabLesson(labeledButNotLab, ["lab", "experiment", "实验"]), false);
  const cjkLab = { title: "浮力实验课", unit: "", sections: { materials: [], stages: [] } };
  assert.equal(isLabLesson(cjkLab, ["lab", "experiment", "实验"]), true);
});

// One worked example per deterministic rule, ported verbatim from the
// retired scripts/run_checks.ts's evaluateRule().
test("evaluateRule: measurable_objectives fails with none, passes when every objective uses a measurable verb", () => {
  const rule = { rule_id: "measurable_objectives", params: {} };
  const noObjectives = { sections: { objectives: [] } };
  assert.deepEqual(evaluateRule(rule, noObjectives, {}), ["fail", "No learning objectives listed."]);
  const measurable = { sections: { objectives: ["Solve one-variable equations.", "Explain each step."] } };
  const [result] = evaluateRule(rule, measurable, {});
  assert.equal(result, "pass");
});

test("evaluateRule: stage_count_timing requires 3+ stages all with minutes > 0", () => {
  const rule = { rule_id: "stage_count_timing", params: {} };
  const tooFew = { sections: { stages: [{ minutes: 5 }, { minutes: 5 }] } };
  assert.equal(evaluateRule(rule, tooFew, {})[0], "fail");
  const untimed = { sections: { stages: [{ minutes: 5 }, { minutes: 0 }, { minutes: 10 }] } };
  assert.equal(evaluateRule(rule, untimed, {})[0], "fail");
  const ok = { sections: { stages: [{ minutes: 5 }, { minutes: 10 }, { minutes: 10 }] } };
  assert.equal(evaluateRule(rule, ok, {})[0], "pass");
});

test("evaluateRule: duration_sum passes within tolerance, warns within 5 min, fails beyond", () => {
  const rule = { rule_id: "duration_sum", params: {} };
  const plan = (total) => ({ class_length_minutes: 45, sections: { stages: [{ minutes: total }] } });
  assert.equal(evaluateRule(rule, plan(45), {})[0], "pass");
  assert.equal(evaluateRule(rule, plan(41), {})[0], "warn");
  assert.equal(evaluateRule(rule, plan(20), {})[0], "fail");
});

test("evaluateRule: homework_assigned fails on an empty homework field", () => {
  const rule = { rule_id: "homework_assigned", params: {} };
  assert.equal(evaluateRule(rule, { sections: { homework: "" } }, {})[0], "fail");
  assert.equal(evaluateRule(rule, { sections: { homework: "Textbook p.87 1-6" } }, {})[0], "pass");
});

test("evaluateRule: template_sections fails when a required key is missing", () => {
  const rule = { rule_id: "template_sections", params: {} };
  const templateSections = [
    { key: "objectives", required: true },
    { key: "homework", required: true },
  ];
  const missingHomework = { sections: { objectives: ["x"], homework: "" } };
  assert.deepEqual(evaluateRule(rule, missingHomework, { templateSections })[0], "fail");
  const complete = { sections: { objectives: ["x"], homework: "y" } };
  assert.equal(evaluateRule(rule, complete, { templateSections })[0], "pass");
});

test("evaluateRule: safety_note_lab only requires a safety note for lab lessons", () => {
  const rule = { rule_id: "safety_note_lab", params: {} };
  const nonLab = { title: "Poetry", unit: "", sections: { materials: [], stages: [], safety_notes: "" } };
  assert.equal(evaluateRule(rule, nonLab, {})[0], "pass");
  const labMissing = { title: "Ohm's Law Lab", unit: "", sections: { materials: [], stages: [], safety_notes: "" } };
  assert.equal(evaluateRule(rule, labMissing, {})[0], "fail");
  const labWithNote = {
    title: "Ohm's Law Lab",
    unit: "",
    sections: { materials: [], stages: [], safety_notes: "Unplug before wiring." },
  };
  assert.equal(evaluateRule(rule, labWithNote, {})[0], "pass");
});

test("evaluateCheck preserves an existing agent-judged agent_review verdict but not an unjudged one", () => {
  const rule = { rule_id: "curriculum_alignment", type: "agent_review" };
  const plan = { sections: { curriculum_refs: ["Standard 7.2.1"] } };
  const judged = { result: "pass", evidence: "Matches 7.2.1", judged_by: "agent" };
  assert.deepEqual(evaluateCheck(rule, plan, {}, judged), ["pass", "Matches 7.2.1"]);
  assert.equal(evaluateCheck(rule, plan, {}, null)[0], "agent_review");
  const noRefs = { sections: { curriculum_refs: [] } };
  assert.deepEqual(evaluateCheck(rule, noRefs, {}, null), ["warn", "No curriculum standard refs listed."]);
});

test("computeComplianceScore scores pass=1/warn=0.5/fail=0 over resolvable checks", () => {
  assert.equal(computeComplianceScore([{ result: "pass" }, { result: "pass" }]), 100);
  assert.equal(computeComplianceScore([{ result: "pass" }, { result: "fail" }]), 50);
  assert.equal(computeComplianceScore([{ result: "pass" }, { result: "warn" }]), 75);
  assert.equal(computeComplianceScore([{ result: "agent_review" }]), 0);
});

test("computeMetrics counts plans by status and the compliance pass rate over resolved checks", () => {
  const plans = [
    { status: "approved" },
    { status: "done" },
    { status: "changes_requested" },
    { status: "needs_review" },
  ];
  const checks = [{ result: "pass" }, { result: "pass" }, { result: "fail" }, { result: "agent_review" }];
  const metrics = computeMetrics({ teachers: [{}], plans, checks });
  assert.equal(metrics.plan_count, 4);
  assert.equal(metrics.plans_approved, 2);
  assert.equal(metrics.plans_in_revision, 1);
  assert.equal(metrics.plans_needs_review, 1);
  assert.equal(metrics.checks_failed, 1);
  assert.equal(metrics.compliance_pass_rate, 67); // 2 of 3 resolved checks pass
});

test("planToReviewItem folds a plan's own review fields into the review-item shape", () => {
  const plan = {
    plan_id: "plan-1",
    ref: 3,
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Add homework"],
    feedback_draft: "Hi teacher",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.deepEqual(planToReviewItem(plan), {
    review_id: "plan-1",
    ref: 3,
    plan_id: "plan-1",
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Add homework"],
    feedback_draft: "Hi teacher",
    created_at: "2026-01-01T00:00:00.000Z",
  });
});

test("deriveActivityLog produces created/updated/decision entries sorted most-recent-first", () => {
  const plans = [
    {
      plan_id: "plan-1",
      title: "Buoyancy",
      source: "agent_draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      decision_action: "approve",
      decision_note: "",
      decided_at: "2026-01-03T00:00:00.000Z",
    },
  ];
  const entries = deriveActivityLog(plans);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].at, "2026-01-03T00:00:00.000Z");
  assert.match(entries[0].detail, /Approved/);
  assert.equal(entries[0].actor, "dean");
  assert.equal(entries[2].actor, "agent");
});

test("normalizePlanRow parses JSON-encoded sections/suggestions off a raw Busabase row", () => {
  const plan = normalizePlanRow({
    plan_id: "plan-1",
    ref: 2,
    title: "Ohm's Law Lab",
    objectives: JSON.stringify(["Understand Ohm's law."]),
    stages: JSON.stringify([{ name: "Setup", minutes: 10, activities: "Wire the circuit." }]),
    suggestions: JSON.stringify(["Add a safety note"]),
    compliance_score: 68,
  });
  assert.equal(plan.ref, 2);
  assert.deepEqual(plan.sections.objectives, ["Understand Ohm's law."]);
  assert.deepEqual(plan.sections.stages, [{ name: "Setup", minutes: 10, activities: "Wire the circuit." }]);
  assert.deepEqual(plan.suggestions, ["Add a safety note"]);
  assert.equal(plan.compliance_score, 68);
});

test("buildConfigSummary parses JSON-encoded template_sections/compliance_rules off a raw Settings row", () => {
  const summary = buildConfigSummary({
    settings: {
      school_name: "Northlake Middle School",
      class_length_minutes: "45",
      template_sections: JSON.stringify([{ key: "objectives", label: "Objectives", required: true }]),
      compliance_rules: JSON.stringify([{ rule_id: "homework_assigned", severity: "warning", type: "deterministic" }]),
    },
  });
  assert.equal(summary.school.name, "Northlake Middle School");
  assert.equal(summary.school.class_length_minutes, 45);
  assert.deepEqual(summary.template_sections[0], { key: "objectives", label: "Objectives", required: true });
  assert.equal(summary.compliance_rules[0].rule_id, "homework_assigned");
});

test("assembleSnapshot sorts plans by ref and folds every plan into review_items", () => {
  const snapshot = assembleSnapshot({
    teachers: [],
    plans: [
      { plan_id: "b", ref: 2, status: "needs_review" },
      { plan_id: "a", ref: 1, status: "approved" },
    ],
    checks: [],
    configSummary: { school: { name: "X" } },
  });
  assert.deepEqual(
    snapshot.plans.map((plan) => plan.plan_id),
    ["a", "b"],
  );
  assert.equal(snapshot.review_items.length, 2);
  assert.equal(snapshot.school.name, "X");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    teachers: [{ teacher_id: "t-1", name: "Alice", grades: JSON.stringify(["Grade 7"]) }],
    plans: [{ plan_id: "plan-1", ref: "1", status: "needs_review", objectives: JSON.stringify(["x"]) }],
    checks: [{ check_id: "chk-1", plan_id: "plan-1", rule_id: "homework_assigned", result: "pass" }],
    settings: { school_name: "Northlake" },
  });
  assert.equal(snapshot.teachers[0].grades[0], "Grade 7");
  assert.equal(snapshot.plans[0].sections.objectives[0], "x");
  assert.equal(snapshot.school.name, "Northlake");
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Math — Linear Equations"), "math-linear-equations");
  assert.equal(slugify("七年级数学一元一次方程"), "七年级数学一元一次方程");
  assert.equal(slugify("七年级数学《一元一次方程》"), "七年级数学-一元一次方程");
});

// planExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see lesson-model.js's doc comment.
test("planExecution maps approve -> publish_plan and request_changes -> request_revision", () => {
  const plan = {
    plan_id: "plan-1",
    grade: "Grade 8",
    subject: "Physics",
    title: "Buoyancy",
    teacher_id: "t-hu",
    feedback_draft: "",
  };
  const dryRun = planExecution(plan, { action: "approve", draft: "" }, { apply: false });
  assert.equal(dryRun.operation, "publish_plan");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/grade-8-physics-buoyancy\.md$/);

  const applied = planExecution(plan, { action: "approve", draft: "Hi Grace" }, { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /send the feedback draft/);

  const revision = planExecution(plan, { action: "request_changes" }, { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "plan-1");

  assert.equal(planExecution(plan, { action: "block" }, { apply: false }), null);
});
