#!/usr/bin/env node
// Writes a small sample lesson snapshot into app/.data/ so the UI, checks,
// export, and executor scripts can be exercised locally. This is generic
// example data, not the ?demo=<scene> mock (which never touches .data).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(skillDir, "app", ".data", "lesson_snapshot.json");
const now = new Date().toISOString();

const teachers = [
  { teacher_id: "t-example-math", name: "Example Math Teacher", subject: "Math", grades: ["Grade 7"] },
  { teacher_id: "t-example-physics", name: "Example Physics Teacher", subject: "Physics", grades: ["Grade 8"] },
];

const rules = [
  { rule_id: "measurable_objectives", name: "Objectives are measurable", severity: "error", type: "deterministic" },
  { rule_id: "stage_count_timing", name: "3+ stages with time allocation", severity: "error", type: "deterministic" },
  { rule_id: "duration_sum", name: "Stage timing sums to class length", severity: "error", type: "deterministic" },
  { rule_id: "homework_assigned", name: "Homework assigned", severity: "warning", type: "deterministic" },
  { rule_id: "template_sections", name: "Uses school template sections", severity: "error", type: "deterministic" },
  { rule_id: "safety_note_lab", name: "Safety note for lab lessons", severity: "error", type: "deterministic" },
  {
    rule_id: "curriculum_alignment",
    name: "Objectives align with curriculum refs",
    severity: "warning",
    type: "agent_review",
  },
];

const plans = [
  {
    plan_id: "plan-example-fractions",
    ref: 1,
    title: "Adding Fractions with Unlike Denominators — Lesson 1",
    subject: "Math",
    grade: "Grade 7",
    unit: "Unit 2: Fractions",
    teacher_id: "t-example-math",
    source: "agent_draft",
    status: "needs_review",
    compliance_score: 0,
    class_length_minutes: 45,
    duration_minutes: 45,
    sections: {
      objectives: [
        "Compute sums of fractions with unlike denominators using common denominators.",
        "Explain why a common denominator is required before adding.",
      ],
      key_points: ["Finding the least common denominator"],
      difficulties: ["Simplifying results after adding"],
      materials: ["Fraction strips", "Worksheet 2.3"],
      stages: [
        { name: "Warm-up", minutes: 6, activities: "Fraction strip comparison puzzles." },
        { name: "Concept building", minutes: 14, activities: "Derive common-denominator method from strips." },
        { name: "Guided practice", minutes: 13, activities: "Solve four problems together." },
        { name: "Independent practice & summary", minutes: 12, activities: "Worksheet 2.3, then summarize." },
      ],
      board_plan: "Strip diagram, worked example, common mistakes corner.",
      homework: "Textbook p.41 problems 1–5.",
      reflection: "",
      curriculum_refs: ["Standards: Number System 7.NS.1"],
      safety_notes: "",
    },
    notes: "",
    created_at: now,
    updated_at: now,
  },
  {
    plan_id: "plan-example-density",
    ref: 2,
    title: "Measuring Density Lab",
    subject: "Physics",
    grade: "Grade 8",
    unit: "Chapter 6: Mass and Density",
    teacher_id: "t-example-physics",
    source: "teacher_import",
    status: "needs_review",
    compliance_score: 0,
    class_length_minutes: 45,
    duration_minutes: 30,
    sections: {
      objectives: ["Understand density."],
      key_points: ["Density formula"],
      difficulties: ["Reading the graduated cylinder"],
      materials: ["Balances, graduated cylinders, metal samples"],
      stages: [
        { name: "Lab experiment", minutes: 30, activities: "Groups measure mass and volume of samples." },
        { name: "Wrap-up", minutes: 0, activities: "Discuss results." },
      ],
      board_plan: "",
      homework: "",
      reflection: "",
      curriculum_refs: [],
      safety_notes: "",
    },
    notes: "",
    created_at: now,
    updated_at: now,
  },
];

const review_items = [
  {
    review_id: "rv-example-fractions",
    ref: 1,
    plan_id: "plan-example-fractions",
    status: "needs_review",
    compliance_summary: "Checks pending — run scripts/run_checks.mjs.",
    suggestions: [],
    feedback_draft: "Hi, the fractions plan is drafted from the Unit 2 materials and is ready for your review.",
    created_at: now,
  },
  {
    review_id: "rv-example-density",
    ref: 2,
    plan_id: "plan-example-density",
    status: "needs_review",
    compliance_summary: "Checks pending — run scripts/run_checks.mjs.",
    suggestions: ["Add a safety note for the lab stage.", "Time every stage and add board plan plus homework."],
    feedback_draft:
      "Hi, the density lab plan is missing several template sections; please complete them before resubmitting.",
    created_at: now,
  },
];

const snapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-lesson-demo",
  school: { name: "Example Middle School", kind: "middle_school", class_length_minutes: 45, term: "Example Term" },
  metrics: {
    teacher_count: teachers.length,
    plan_count: plans.length,
    plans_approved: 0,
    plans_in_revision: 0,
    plans_needs_review: plans.length,
    checks_failed: 0,
    compliance_pass_rate: 0,
  },
  teachers,
  plans,
  rules,
  checks: [],
  review_items,
  activity_log: [
    {
      id: "act-example-1",
      at: now,
      actor: "agent",
      detail: "Generated example snapshot with 2 plans.",
      plan_id: "plan-example-fractions",
    },
  ],
  warnings: [],
};

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${out}`);
