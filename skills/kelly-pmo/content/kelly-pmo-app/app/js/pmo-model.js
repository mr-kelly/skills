export const PROJECT_STATUSES = ["proposed", "planning", "active", "paused", "complete"];
export const HEALTH_LEVELS = ["green", "amber", "red"];
export const MILESTONE_STATUSES = ["not_started", "in_progress", "at_risk", "blocked", "done"];
export const DECISION_STATUSES = ["needs_review", "changes_requested", "approved", "blocked", "done"];

const text = (value) => String(value ?? "");
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`;

export function buildProject(input = {}) {
  const timestamp = now();
  return {
    id: text(input.id) || newId("prj-"),
    name: text(input.name),
    program: text(input.program),
    type: text(input.type),
    status: text(input.status) || "planning",
    health: text(input.health) || "green",
    owner: text(input.owner),
    sponsor: text(input.sponsor),
    budget: text(input.budget),
    progress: Math.max(0, Math.min(100, number(input.progress))),
    start_date: text(input.start_date),
    target_date: text(input.target_date),
    last_report_at: text(input.last_report_at),
    next_report_due: text(input.next_report_due),
    next_action: text(input.next_action),
    created_at: text(input.created_at) || timestamp,
    updated_at: timestamp,
  };
}

export function projectToFields(item = {}) {
  return {
    "project-id": item.id || "",
    name: item.name || "",
    program: item.program || "",
    type: item.type || "",
    status: item.status || "planning",
    health: item.health || "green",
    owner: item.owner || "",
    sponsor: item.sponsor || "",
    budget: item.budget || "",
    progress: number(item.progress),
    "start-date": item.start_date || "",
    "target-date": item.target_date || "",
    "last-report-at": item.last_report_at || "",
    "next-report-due": item.next_report_due || "",
    "next-action": item.next_action || "",
    "created-at": item.created_at || now(),
    "updated-at": item.updated_at || now(),
  };
}

export function normalizeProjectRow(row = {}) {
  return {
    id: text(row.project_id),
    name: text(row.name),
    program: text(row.program),
    type: text(row.type),
    status: text(row.status) || "planning",
    health: text(row.health) || "green",
    owner: text(row.owner),
    sponsor: text(row.sponsor),
    budget: text(row.budget),
    progress: Math.max(0, Math.min(100, number(row.progress))),
    start_date: text(row.start_date),
    target_date: text(row.target_date),
    last_report_at: text(row.last_report_at),
    next_report_due: text(row.next_report_due),
    next_action: text(row.next_action),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function milestoneToFields(item = {}) {
  return {
    "milestone-id": item.id || "",
    "project-id": item.project_id || "",
    title: item.title || "",
    owner: item.owner || "",
    "due-date": item.due_date || "",
    status: item.status || "not_started",
    progress: number(item.progress),
    evidence: item.evidence || "",
    "created-at": item.created_at || now(),
    "updated-at": item.updated_at || now(),
  };
}

export function normalizeMilestoneRow(row = {}) {
  return {
    id: text(row.milestone_id),
    project_id: text(row.project_id),
    title: text(row.title),
    owner: text(row.owner),
    due_date: text(row.due_date),
    status: text(row.status) || "not_started",
    progress: Math.max(0, Math.min(100, number(row.progress))),
    evidence: text(row.evidence),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function normalizeRiskRow(row = {}) {
  return {
    id: text(row.risk_id),
    project_id: text(row.project_id),
    title: text(row.title),
    category: text(row.category),
    probability: text(row.probability),
    impact: text(row.impact),
    status: text(row.status) || "open",
    owner: text(row.owner),
    mitigation: text(row.mitigation),
    review_date: text(row.review_date),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function normalizeReportRow(row = {}) {
  return {
    id: text(row.report_id),
    project_id: text(row.project_id),
    period_key: text(row.period_key),
    summary: text(row.summary),
    progress: Math.max(0, Math.min(100, number(row.progress))),
    health: text(row.health) || "green",
    accomplishments: text(row.accomplishments),
    next_period: text(row.next_period),
    blockers: text(row.blockers),
    decisions_needed: text(row.decisions_needed),
    submitted_at: text(row.submitted_at),
    updated_at: text(row.updated_at),
  };
}

export function decisionToFields(item = {}) {
  return {
    "decision-id": item.id || "",
    ref: number(item.ref),
    "project-id": item.project_id || "",
    title: item.title || "",
    summary: item.summary || "",
    recommendation: item.recommendation || "",
    status: item.status || "needs_review",
    "decision-note": item.decision_note || "",
    "decided-at": item.decided_at || "",
    "created-at": item.created_at || now(),
    "updated-at": item.updated_at || now(),
  };
}

export function normalizeDecisionRow(row = {}) {
  return {
    id: text(row.decision_id),
    ref: number(row.ref),
    project_id: text(row.project_id),
    title: text(row.title),
    summary: text(row.summary),
    recommendation: text(row.recommendation),
    status: text(row.status) || "needs_review",
    decision_note: text(row.decision_note),
    decided_at: text(row.decided_at),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function normalizeSettingsRow(row = {}) {
  return {
    record_id: text(row.record_id),
    portfolio_name: text(row.portfolio_name),
    timezone: text(row.timezone),
    reporting_weekday: text(row.reporting_weekday),
    amber_threshold_days: number(row.amber_threshold_days, 7),
    red_threshold_days: number(row.red_threshold_days, 0),
    status_freshness_days: number(row.status_freshness_days, 7),
    resource_capacity_policy: text(row.resource_capacity_policy),
    decision_policy: text(row.decision_policy),
    onboarding_version: number(row.onboarding_version),
    onboarding_status: text(row.onboarding_status),
    completed_at: text(row.completed_at),
    updated_at: text(row.updated_at),
  };
}

export function milestonesWithProject(milestones = [], projects = []) {
  const byId = new Map(projects.map((item) => [item.id, item]));
  return milestones.map((item) => ({ ...item, project: byId.get(item.project_id) || null }));
}

export function daysFromToday(value, generatedAt = now()) {
  if (!value) return null;
  const delta = new Date(`${value}T23:59:59Z`).getTime() - new Date(generatedAt).getTime();
  return Number.isFinite(delta) ? Math.ceil(delta / 86_400_000) : null;
}

export function isMilestoneDueSoon(item, generatedAt) {
  if (item.status === "done") return false;
  const days = daysFromToday(item.due_date, generatedAt);
  return days !== null && days <= 14;
}

export function computeMetrics(
  projects = [],
  milestones = [],
  risks = [],
  reports = [],
  decisions = [],
  generatedAt = now(),
) {
  const active = projects.filter((item) => !["complete", "paused"].includes(item.status));
  const due = milestones.filter((item) => isMilestoneDueSoon(item, generatedAt));
  const openRisks = risks.filter((item) => item.status !== "closed");
  const stale = projects.filter((item) => {
    if (["complete", "paused"].includes(item.status)) return false;
    const days = daysFromToday(item.next_report_due, generatedAt);
    return days !== null && days < 0;
  });
  return {
    projects: projects.length,
    active: active.length,
    average_progress: active.length
      ? Math.round(active.reduce((sum, item) => sum + item.progress, 0) / active.length)
      : 0,
    red_projects: projects.filter((item) => item.health === "red").length,
    due_milestones: due.length,
    open_risks: openRisks.length,
    high_risks: openRisks.filter((item) => item.impact === "high" && item.probability !== "low").length,
    stale_reports: stale.length,
    decisions: decisions.filter((item) => item.status === "needs_review").length,
    reports: reports.length,
  };
}

export function buildState(
  projects = [],
  milestones = [],
  risks = [],
  reports = [],
  decisions = [],
  settings = {},
  extra = {},
) {
  const generatedAt = extra.generated_at || now();
  return {
    ...extra,
    generated_at: generatedAt,
    projects,
    milestones,
    risks,
    reports,
    decisions,
    settings,
    metrics: computeMetrics(projects, milestones, risks, reports, decisions, generatedAt),
  };
}
