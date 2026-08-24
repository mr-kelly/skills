// Pure domain logic for kelly-lesson, ported verbatim (same variable names,
// same order of operations, only TS types stripped) from the retired
// scripts/run_checks.ts (DEFAULT_MEASURABLE_VERBS/DEFAULT_LAB_KEYWORDS/
// sectionValue/sectionPresent/isLabLesson/evaluateRule/the POINTS scoring
// table) and lib/data-provider/local-file-provider.ts (summarizeConfig's
// shape, applyDecision's action -> status table). The retired local-file
// snapshot lived in one app/.data/lesson_snapshot.json file; this module
// instead builds the same snapshot shape from four live Busabase Bases
// (teachers/plans/checks/settings) read fresh on every getState(), so
// buildSnapshot() below takes those rows directly.
//
// review_items and activity_log are no longer separate persisted buckets:
// a review item is just its plan's own review-related fields
// (compliance_summary/suggestions/feedback_draft/decision_*), and the
// activity feed is derived from each plan's
// created_at/updated_at/decided_at instead of an append-only log file —
// Busabase reads are always live, so there is no staleness to paper over
// the way the old effectivePlanStatus()/effectiveReviewStatus() overlay in
// app.js had to.
//
// statusForVerdict is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() action table.
// planExecution is adapted (not a byte-for-byte port, since the retired
// scripts/execute_decisions.ts wrote a list of ExecutionResult entries to a
// separate execution_report.json and this shape has one execution marker
// directly on the plan record) from the same script's publish_plan /
// send_feedback / request_revision decisions.

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function slugify(value = "") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "plan"
  );
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeTeacherRow({ teacher_id = "", name = "", subject = "", grades = "" } = {}) {
  return {
    teacher_id,
    name: name || teacher_id,
    subject,
    grades: parseJsonValue(grades, []) || [],
  };
}

export function normalizePlanRow({
  plan_id = "",
  ref = 0,
  title = "",
  subject = "",
  grade = "",
  unit = "",
  teacher_id = "",
  source = "agent_draft",
  status = "needs_review",
  compliance_score = 0,
  class_length_minutes = 45,
  duration_minutes = 0,
  objectives = "",
  key_points = "",
  difficulties = "",
  materials = "",
  curriculum_refs = "",
  board_plan = "",
  homework = "",
  reflection = "",
  safety_notes = "",
  stages = "",
  notes = "",
  compliance_summary = "",
  suggestions = "",
  feedback_draft = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    plan_id,
    ref: Number(ref) || 0,
    title: title || "(untitled)",
    subject,
    grade,
    unit,
    teacher_id,
    source,
    status,
    compliance_score: Number(compliance_score) || 0,
    class_length_minutes: Number(class_length_minutes) || 45,
    duration_minutes: Number(duration_minutes) || 0,
    sections: {
      objectives: parseJsonValue(objectives, []) || [],
      key_points: parseJsonValue(key_points, []) || [],
      difficulties: parseJsonValue(difficulties, []) || [],
      materials: parseJsonValue(materials, []) || [],
      curriculum_refs: parseJsonValue(curriculum_refs, []) || [],
      board_plan,
      homework,
      reflection,
      safety_notes,
      stages: parseJsonValue(stages, []) || [],
    },
    notes,
    compliance_summary,
    suggestions: parseJsonValue(suggestions, []) || [],
    feedback_draft,
    decision_action,
    decision_note,
    decided_at: decided_at || undefined,
    execution_status: execution_status || undefined,
    execution_operation: execution_operation || undefined,
    execution_target: execution_target || undefined,
    execution_detail: execution_detail || undefined,
    executed_at: executed_at || undefined,
    created_at,
    updated_at,
  };
}

export function normalizeCheckRow({
  check_id = "",
  plan_id = "",
  rule_id = "",
  severity = "warning",
  result = "pass",
  evidence = "",
  judged_by = "",
  checked_at = "",
} = {}) {
  return { check_id, plan_id, rule_id, severity, result, evidence, judged_by: judged_by || undefined, checked_at };
}

// Sanitized config summary for #/settings and the check/ingest scripts — no
// separate config file in the Busabase-only shape, so this reads straight
// off the live Settings row. Shape mirrors the retired
// local-file-provider.ts's summarizeConfig().
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  const templateSections = parseJsonValue(settings.template_sections, []) || [];
  const complianceRules = parseJsonValue(settings.compliance_rules, []) || [];
  return {
    config_path: "busabase",
    is_example: false,
    school: {
      name: settings.school_name || "",
      kind: settings.school_kind || "",
      term: settings.school_term || "",
      class_length_minutes: Number(settings.class_length_minutes) || 45,
    },
    subjects: parseJsonValue(settings.subjects, []) || [],
    grades: parseJsonValue(settings.grades, []) || [],
    template_sections: templateSections.map((section) => ({
      key: section.key || "",
      label: section.label || section.key || "",
      required: Boolean(section.required),
    })),
    compliance_rules: complianceRules.map((rule) => ({
      rule_id: rule.rule_id || "",
      name: rule.name || rule.rule_id || "",
      severity: rule.severity || "warning",
      type: rule.type || "deterministic",
      params: rule.params,
    })),
    export: {
      format: settings.export_format || "markdown",
      out_dir: settings.export_out_dir || "exports",
      docx_via_agent: settings.docx_via_agent !== "false",
    },
    feedback: {
      handoff_skill: settings.feedback_handoff_skill || "",
      requires_approval: settings.feedback_requires_approval !== "false",
      secret_envs: [],
      secrets_ready: true,
    },
  };
}

// ---- Deterministic compliance checks, ported verbatim from the retired
// scripts/run_checks.ts ----

export const DEFAULT_MEASURABLE_VERBS = [
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
export const DEFAULT_LAB_KEYWORDS = ["lab", "experiment", "实验"];

export function sectionValue(plan, key) {
  return plan.sections?.[key];
}

export function sectionPresent(plan, key) {
  const value = sectionValue(plan, key);
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function isLabLesson(plan, keywords) {
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

export function evaluateRule(rule, plan, { classLength = 45, templateSections = [] } = {}) {
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

// Ported verbatim from the retired scripts/run_checks.ts's per-rule loop
// body: agent_review rules preserve an existing agent-judged verdict,
// otherwise fall back to "warn" (no curriculum refs) or "agent_review"
// (pending). Deterministic rules go through evaluateRule().
export function evaluateCheck(rule, plan, { classLength = 45, templateSections = [] } = {}, existingCheck = null) {
  if ((rule.type || "deterministic") === "agent_review") {
    if (
      existingCheck &&
      ["pass", "warn", "fail"].includes(existingCheck.result) &&
      existingCheck.judged_by === "agent"
    ) {
      return [existingCheck.result, existingCheck.evidence];
    }
    if (!(plan.sections?.curriculum_refs || []).length) {
      return ["warn", "No curriculum standard refs listed."];
    }
    return ["agent_review", `Awaiting agent judgement against: ${(plan.sections.curriculum_refs || []).join("; ")}`];
  }
  return evaluateRule(rule, plan, { classLength, templateSections });
}

const POINTS = { pass: 1, warn: 0.5, fail: 0 };

// Ported verbatim from the retired scripts/run_checks.ts's per-plan scoring loop.
export function computeComplianceScore(planChecks = []) {
  const scorable = planChecks.filter((check) => check.result in POINTS);
  const total = scorable.length || 1;
  const points = scorable.reduce((sum, check) => sum + POINTS[check.result], 0);
  return Math.round((points / total) * 100);
}

// Ported verbatim from the retired scripts/run_checks.ts's metrics block
// (also matches local-file-provider.ts's applyDecision-adjacent metrics).
export function computeMetrics({ teachers = [], plans = [], checks = [] } = {}) {
  const resolved = checks.filter((check) => ["pass", "warn", "fail"].includes(check.result));
  return {
    teacher_count: teachers.length,
    plan_count: plans.length,
    plans_approved: plans.filter((plan) => ["approved", "done"].includes(plan.status)).length,
    plans_in_revision: plans.filter((plan) => plan.status === "changes_requested").length,
    plans_needs_review: plans.filter((plan) => plan.status === "needs_review").length,
    checks_failed: checks.filter((check) => check.result === "fail").length,
    compliance_pass_rate: Math.round(
      (resolved.filter((check) => check.result === "pass").length / Math.max(1, resolved.length)) * 100,
    ),
  };
}

// A review item is the plan itself: no separate decisions.json-equivalent
// bucket in the Busabase-only shape (see the module doc comment above).
export function planToReviewItem(plan) {
  return {
    review_id: plan.plan_id,
    ref: plan.ref,
    plan_id: plan.plan_id,
    status: plan.status,
    compliance_summary: plan.compliance_summary,
    suggestions: plan.suggestions,
    feedback_draft: plan.feedback_draft,
    created_at: plan.created_at,
  };
}

// New orchestration (not a port): derives a recent-activity feed from each
// plan's own timestamps instead of reading a persisted activity_log.json,
// since Busabase reads are always live.
export function deriveActivityLog(plans = [], { limit = 50 } = {}) {
  const entries = [];
  for (const plan of plans) {
    if (plan.created_at) {
      entries.push({
        id: `act-${plan.plan_id}-created`,
        at: plan.created_at,
        actor: "agent",
        detail:
          plan.source === "teacher_import"
            ? `Imported plan "${plan.title}" from a teacher's document.`
            : `Drafted plan "${plan.title}" from curriculum materials and the school template.`,
        plan_id: plan.plan_id,
      });
    }
    if (plan.updated_at && plan.updated_at !== plan.created_at) {
      entries.push({
        id: `act-${plan.plan_id}-updated`,
        at: plan.updated_at,
        actor: "agent",
        detail: `Updated plan "${plan.title}".`,
        plan_id: plan.plan_id,
      });
    }
    if (plan.decided_at && plan.decision_action) {
      const label =
        plan.decision_action === "approve"
          ? "Approved"
          : plan.decision_action === "request_changes"
            ? "Requested changes on"
            : plan.decision_action === "block"
              ? "Blocked"
              : "Revised";
      entries.push({
        id: `act-${plan.plan_id}-decision`,
        at: plan.decided_at,
        actor: "dean",
        detail: `${label} "${plan.title}"${plan.decision_note ? `: ${plan.decision_note}` : "."}`,
        plan_id: plan.plan_id,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Pure assembly on already-parsed teachers/plans/checks (sections as real
// objects/arrays, not JSON strings) plus a configSummary in
// buildConfigSummary()'s output shape. Used directly by the demo provider
// (which builds its fixtures already in this shape, same split as
// kelly-audit's deriveSnapshot()/buildSnapshot()) and by buildSnapshot()
// below for the Busabase-row path.
/**
 * @param {{
 *   teachers?: Array<Record<string, any>>,
 *   plans?: Array<Record<string, any>>,
 *   checks?: Array<Record<string, any>>,
 *   configSummary?: Record<string, any>,
 *   now?: string,
 * }} [args]
 */
export function assembleSnapshot({
  teachers = [],
  plans = [],
  checks = [],
  configSummary = {},
  now = new Date().toISOString(),
} = {}) {
  const sortedPlans = [...plans].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const metrics = computeMetrics({ teachers, plans: sortedPlans, checks });
  const warnings = [];
  if (!sortedPlans.length) {
    warnings.push({
      id: "no-snapshot",
      severity: "info",
      message:
        "No lesson plans yet. Ingest a lesson plan or ask the agent to draft one from your curriculum materials.",
    });
  }
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-lesson",
    school: {
      name: configSummary.school?.name || "",
      kind: configSummary.school?.kind || "",
      class_length_minutes: configSummary.school?.class_length_minutes || 45,
      term: configSummary.school?.term || "",
    },
    metrics,
    teachers,
    plans: sortedPlans,
    rules: configSummary.compliance_rules || [],
    checks,
    review_items: sortedPlans.map(planToReviewItem),
    activity_log: deriveActivityLog(sortedPlans),
    warnings,
  };
}

// Busabase-row wrapper: normalizes the raw teachers/plans/checks rows read
// from Busabase (already snake_cased by the provider) into the
// Teacher/Plan/Check shapes the UI expects, pulls the school/rules/template
// off the live Settings row (no separate config store), then calls
// assembleSnapshot() — this is new orchestration, not a port, since the
// retired app/server/hono.ts read one persisted snapshot file instead of
// four live Bases.
export function buildSnapshot({
  teachers = [],
  plans = [],
  checks = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  return assembleSnapshot({
    teachers: teachers.map(normalizeTeacherRow),
    plans: plans.map(normalizePlanRow),
    checks: checks.map(normalizeCheckRow),
    configSummary: buildConfigSummary({ settings }),
    now,
  });
}

// ---- Decision -> status mapping, ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's applyDecision() ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus; // "revise" edits the draft/note only, status is unchanged
}

// Adapted from the retired scripts/execute_decisions.ts: maps an approved or
// changes-requested plan to the concrete follow-up operation the agent must
// perform outside the app, and the target the operation acts on. The retired
// script recorded a list of ExecutionResult entries in a separate
// execution_report.json; this shape writes one execution marker directly
// onto the plan record instead (see config.js's execution-* fields), so
// "send_feedback" is folded into publish_plan's detail rather than being a
// second entry.
export function planExecution(plan, decision, { apply = false } = {}) {
  if (decision.action === "approve") {
    const target = `exports/${slugify(`${plan.grade}-${plan.subject}-${plan.title}`)}.md`;
    const draft = decision.draft ?? plan.feedback_draft ?? "";
    return {
      operation: "publish_plan",
      target,
      status: apply ? "ready_for_agent" : "planned",
      detail: draft.trim()
        ? `Run scripts/export_plans.mjs to write ${target}; then send the feedback draft to ${plan.teacher_id} via other channels per SKILL.md.`
        : `Run scripts/export_plans.mjs to write ${target}.`,
    };
  }
  if (decision.action === "request_changes") {
    return {
      operation: "request_revision",
      target: plan.plan_id,
      status: apply ? "ready_for_agent" : "planned",
      detail:
        "Redraft the plan per the review note, then re-ingest with scripts/ingest_plan.mjs and re-run scripts/run_checks.mjs.",
    };
  }
  return null;
}
