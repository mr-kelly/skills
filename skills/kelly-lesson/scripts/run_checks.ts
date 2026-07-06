#!/usr/bin/env node
// Deterministic compliance checker. Reads compliance rules from private config
// (or config.example.json), evaluates every plan in the snapshot, merges the
// results into checks[], recomputes per-plan compliance scores and metrics,
// and writes the snapshot back. Re-running is idempotent.
//
// Rules typed "agent_review" are not judged here: an existing agent-provided
// pass/warn/fail result (delivered via an ingest payload) is preserved;
// otherwise the check is marked "agent_review" (or "warn" when the plan has
// no curriculum refs to judge against).
//
// Reaches lesson state only through the data-provider (local default / Busabase).
import { createProvider } from "../lib/data-provider/index.ts";
import type { Check } from "../lib/types.ts";

const provider = await createProvider();

const lock = await provider.readLock();
if (lock) {
  console.error(`Refusing to run checks: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await provider.readSnapshot();
if (!snapshot || !(snapshot.plans || []).length) {
  console.error("No snapshot plans found. Ingest a plan first.");
  process.exit(1);
}

const config = (await provider.readConfig()).config;
const configRules = Array.isArray(config.compliance_rules) ? config.compliance_rules : [];
if (!configRules.length) {
  console.error("No compliance_rules found in config. Add them to config.local.json.");
  process.exit(1);
}
const templateSections = Array.isArray(config.template_sections) ? config.template_sections : [];
const classLength = config.school?.class_length_minutes ?? snapshot.school?.class_length_minutes ?? 45;

const DEFAULT_MEASURABLE_VERBS = [
  "identify",
  "solve",
  "explain",
  "apply",
  "list",
  "compare",
  "calculate",
  "summarize",
  "analyze",
  "use",
  "describe",
  "state",
  "measure",
  "construct",
  "sketch",
  "recite",
  "predict",
  "compute",
  "extract",
  "write",
  "说出",
  "写出",
  "计算",
  "运用",
  "分析",
  "归纳",
  "比较",
  "解释",
  "识别",
  "列举",
  "描述",
  "背诵",
  "测量",
  "画出",
  "会画",
  "预测",
  "陈述",
  "提取",
  "完成",
];
const DEFAULT_LAB_KEYWORDS = ["lab", "experiment", "实验"];

function sectionValue(plan, key) {
  return plan.sections?.[key];
}

function sectionPresent(plan, key) {
  const value = sectionValue(plan, key);
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function isLabLesson(plan, keywords) {
  const haystack = [
    plan.title,
    plan.unit,
    ...(plan.sections?.materials || []),
    ...(plan.sections?.stages || []).map((stage) => `${stage.name} ${stage.activities || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => {
    const needle = String(keyword).toLowerCase();
    // Word-boundary match for ASCII keywords so "lab" does not match "label";
    // CJK keywords (no word boundaries) use plain substring matching.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII-range (\x00-\x7f) test to distinguish ASCII from CJK keywords
    if (/^[\x00-\x7f]+$/.test(needle)) {
      return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
    }
    return haystack.includes(needle);
  });
}

function evaluateRule(rule, plan) {
  const params = rule.params || {};
  const stages = plan.sections?.stages || [];
  const objectives = plan.sections?.objectives || [];
  switch (rule.rule_id) {
    case "measurable_objectives": {
      const minObjectives = params.min_objectives ?? 2;
      const verbs = (params.measurable_verbs || DEFAULT_MEASURABLE_VERBS).map((verb) => String(verb).toLowerCase());
      if (!objectives.length) return ["fail", "No learning objectives listed."];
      const measurable = objectives.filter((objective) =>
        verbs.some((verb) => String(objective).toLowerCase().includes(verb)),
      );
      if (measurable.length === objectives.length && objectives.length >= minObjectives) {
        return ["pass", `${objectives.length} objectives, all with measurable verbs.`];
      }
      if (!measurable.length) return ["fail", `None of the ${objectives.length} objectives uses a measurable verb.`];
      return [
        "warn",
        `${measurable.length} of ${objectives.length} objectives use measurable verbs (minimum ${minObjectives} objectives).`,
      ];
    }
    case "stage_count_timing": {
      const minStages = params.min_stages ?? 3;
      if (stages.length < minStages)
        return ["fail", `Only ${stages.length} stage(s) listed; at least ${minStages} required.`];
      const untimed = stages.filter((stage) => !(Number(stage.minutes) > 0));
      if (untimed.length) return ["fail", `${stages.length} stages but ${untimed.length} have no time allocation.`];
      return ["pass", `${stages.length} stages, all with time allocation.`];
    }
    case "duration_sum": {
      const tolerance = params.tolerance_minutes ?? 2;
      const total = stages.reduce((sum, stage) => sum + Number(stage.minutes || 0), 0);
      const target = plan.class_length_minutes || classLength;
      const delta = Math.abs(total - target);
      if (delta <= tolerance) return ["pass", `Stages total ${total} min for a ${target} min class.`];
      if (delta <= 5) return ["warn", `Stages total ${total} min vs ${target} min class length.`];
      return ["fail", `Stages total ${total} min vs ${target} min class length.`];
    }
    case "homework_assigned": {
      if (sectionPresent(plan, "homework")) {
        return ["pass", `Homework: "${String(plan.sections.homework).slice(0, 60)}"`];
      }
      return ["fail", "Homework section is empty."];
    }
    case "template_sections": {
      const required = templateSections.filter((section) => section.required).map((section) => section.key);
      const missing = required.filter((key) => !sectionPresent(plan, key));
      if (!missing.length) return ["pass", "All required template sections are present."];
      return ["fail", `Missing required sections: ${missing.join(", ")}.`];
    }
    case "safety_note_lab": {
      const keywords = params.lab_keywords || DEFAULT_LAB_KEYWORDS;
      if (!isLabLesson(plan, keywords)) return ["pass", "Not a lab lesson; no safety note required."];
      if (sectionPresent(plan, "safety_notes")) {
        return ["pass", `Safety note present: "${String(plan.sections.safety_notes).slice(0, 60)}"`];
      }
      return ["fail", "Lab lesson but no safety note."];
    }
    default:
      return ["warn", `No deterministic evaluator for rule ${rule.rule_id}.`];
  }
}

const now = new Date().toISOString();
const existingChecks = new Map<string, Check>(
  ((snapshot.checks || []) as Check[]).map((check) => [`${check.plan_id}:${check.rule_id}`, check]),
);
const checks = [];

for (const plan of snapshot.plans || []) {
  for (const rule of configRules) {
    const key = `${plan.plan_id}:${rule.rule_id}`;
    const existing = existingChecks.get(key);
    let result: string;
    let evidence: string;
    if ((rule.type || "deterministic") === "agent_review") {
      if (existing && ["pass", "warn", "fail"].includes(existing.result) && existing.judged_by === "agent") {
        result = existing.result;
        evidence = existing.evidence;
      } else if (!(plan.sections?.curriculum_refs || []).length) {
        result = "warn";
        evidence = "No curriculum standard refs listed.";
      } else {
        result = "agent_review";
        evidence = `Awaiting agent judgement against: ${(plan.sections.curriculum_refs || []).join("; ")}`;
      }
    } else {
      [result, evidence] = evaluateRule(rule, plan);
    }
    checks.push({
      check_id: `chk-${plan.plan_id.replace(/^plan-/, "")}-${rule.rule_id}`,
      plan_id: plan.plan_id,
      rule_id: rule.rule_id,
      severity: rule.severity || "warning",
      result,
      evidence,
      ...(existing?.judged_by ? { judged_by: existing.judged_by } : {}),
      checked_at: now,
    });
  }
}

const POINTS = { pass: 1, warn: 0.5, fail: 0 };
for (const plan of snapshot.plans || []) {
  const planChecks = checks.filter((check) => check.plan_id === plan.plan_id && check.result in POINTS);
  const total = planChecks.length || 1;
  const points = planChecks.reduce((sum, check) => sum + POINTS[check.result], 0);
  plan.compliance_score = Math.round((points / total) * 100);
}

snapshot.rules = configRules.map((rule) => ({
  rule_id: rule.rule_id,
  name: rule.name || rule.rule_id,
  severity: rule.severity || "warning",
  type: rule.type || "deterministic",
}));
snapshot.checks = checks;

const resolved = checks.filter((check) => check.result in POINTS);
snapshot.metrics = {
  ...snapshot.metrics,
  teacher_count: (snapshot.teachers || []).length,
  plan_count: (snapshot.plans || []).length,
  plans_approved: (snapshot.plans || []).filter((plan) => ["approved", "done"].includes(plan.status)).length,
  plans_in_revision: (snapshot.plans || []).filter((plan) => plan.status === "changes_requested").length,
  plans_needs_review: (snapshot.plans || []).filter((plan) => plan.status === "needs_review").length,
  checks_failed: checks.filter((check) => check.result === "fail").length,
  compliance_pass_rate: Math.round(
    (resolved.filter((check) => check.result === "pass").length / Math.max(1, resolved.length)) * 100,
  ),
};
snapshot.generated_at = now;

await provider.writeSnapshot(snapshot);
const failCount = snapshot.metrics.checks_failed;
const warnCount = checks.filter((check) => check.result === "warn").length;
const pending = checks.filter((check) => check.result === "agent_review").length;
console.log(
  `Checked ${(snapshot.plans || []).length} plan(s) against ${configRules.length} rule(s): ${failCount} fail, ${warnCount} warn, ${pending} awaiting agent review.`,
);
console.log("Wrote lesson_snapshot.json");
