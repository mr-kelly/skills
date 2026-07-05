// Core domain types shared across the kelly-lesson server, store, and scripts.
// These model the ACTUAL shapes produced by demo.ts / store.ts / the ingest and
// check scripts, and the lesson snapshot written to app/.data/lesson_snapshot.json.

export type ComplianceResult = "pass" | "warn" | "fail" | "agent_review";
export type RuleSeverity = "error" | "warning" | string;
export type RuleType = "deterministic" | "agent_review" | string;
export type PlanStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked" | string;
export type PlanSource = "agent_draft" | "teacher_import" | string;
export type DecisionAction = "approve" | "request_changes" | "block" | "revise" | string;

export interface Stage {
  name: string;
  minutes: number;
  activities: string;
}

export interface PlanSections {
  objectives?: string[];
  key_points?: string[];
  difficulties?: string[];
  materials?: string[];
  curriculum_refs?: string[];
  board_plan?: string;
  homework?: string;
  reflection?: string;
  safety_notes?: string;
  stages?: Stage[];
  [key: string]: unknown;
}

export interface Teacher {
  teacher_id: string;
  name: string;
  subject: string;
  grades: string[];
}

export interface Plan {
  plan_id: string;
  ref: number;
  title: string;
  subject: string;
  grade: string;
  unit?: string;
  teacher_id: string;
  source?: PlanSource;
  status?: PlanStatus;
  compliance_score?: number;
  class_length_minutes?: number;
  duration_minutes?: number;
  sections: PlanSections;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Rule {
  rule_id: string;
  name: string;
  severity: RuleSeverity;
  type: RuleType;
}

export interface TemplateSection {
  key: string;
  label: string;
  required: boolean;
}

export interface Check {
  check_id: string;
  plan_id: string;
  rule_id: string;
  severity: RuleSeverity;
  result: ComplianceResult;
  evidence: string;
  judged_by?: string;
  checked_at: string;
}

export interface ReviewItem {
  review_id: string;
  ref: number;
  plan_id: string;
  status: PlanStatus;
  compliance_summary: string;
  suggestions: string[];
  feedback_draft: string;
  created_at?: string;
  ref_unit?: string;
}

export interface Activity {
  id: string;
  at: string;
  actor: string;
  detail: string;
  plan_id?: string;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  plan_id?: string;
  detail?: string;
}

export interface Metrics {
  teacher_count: number;
  plan_count: number;
  plans_approved: number;
  plans_in_revision: number;
  plans_needs_review: number;
  checks_failed: number;
  compliance_pass_rate: number;
}

export interface School {
  name: string;
  kind: string;
  class_length_minutes: number;
  term: string;
}

export interface LessonSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  school: School;
  metrics: Metrics;
  teachers: Teacher[];
  plans: Plan[];
  rules: Rule[];
  checks: Check[];
  review_items: ReviewItem[];
  activity_log: Activity[];
  warnings: Warning[];
}

// ---- Decisions ----

export interface Decision {
  action: DecisionAction;
  comment: string;
  draft?: string;
  decided_at: string;
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

// Request body for POST /api/decision (and the applyDecision payload).
export interface DecisionBody {
  action?: string;
  review_id?: string;
  plan_id?: string;
  comment?: string;
  draft?: string;
}

// ---- Agent tasks ----

export interface AgentTask {
  task_id: string;
  type: string;
  review_id: string;
  plan_id: string;
  ref?: number;
  comment?: string;
  draft?: string;
  requested_at: string;
  status: string;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: AgentTask[];
}

// ---- Execution report ----

export interface ExecutionResult {
  review_id: string;
  plan_id: string;
  ref?: number;
  status: string;
  operation: string;
  target: string;
  detail?: string;
  draft?: string;
  comment?: string;
  reason?: string;
  executed_at: string;
}

export interface ExecutionReport {
  executed_at: string;
  dry_run: boolean;
  source: string;
  results: ExecutionResult[];
}

// ---- Lock ----

export interface Lock {
  owner?: string;
  message?: string;
  [key: string]: unknown;
}

// ---- Config ----

export interface ConfigSchool {
  name?: string;
  kind?: string;
  term?: string;
  class_length_minutes?: number;
}

export interface ConfigTemplateSection {
  key?: string;
  label?: string;
  required?: boolean;
}

export interface ConfigRule {
  rule_id?: string;
  name?: string;
  severity?: string;
  type?: string;
}

export interface ConfigFeedback {
  handoff_skill?: string;
  requires_approval?: boolean;
  token_env?: string;
  api_key_env?: string;
  password_env?: string;
  [key: string]: unknown;
}

export interface ConfigExport {
  format?: string;
  out_dir?: string;
  docx_via_agent?: boolean;
}

export interface Config {
  data_provider?: string;
  school?: ConfigSchool;
  subjects?: string[];
  grades?: string[];
  template_sections?: ConfigTemplateSection[];
  compliance_rules?: ConfigRule[];
  export?: ConfigExport;
  feedback?: ConfigFeedback;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  school: {
    name: string;
    kind: string;
    term: string;
    class_length_minutes: number;
  };
  subjects: string[];
  grades: string[];
  template_sections: TemplateSection[];
  compliance_rules: Rule[];
  export: {
    format: string;
    out_dir: string;
    docx_via_agent: boolean;
  };
  feedback: {
    handoff_skill: string;
    requires_approval: boolean;
    secret_envs: string[];
    secrets_ready: boolean;
  };
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

// Query params for the demo state endpoint.
export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}
