export type WorkflowStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type QuestionOutcome = "correct" | "wrong" | "uncertain" | "in_progress";
export type DecisionAction = "approve" | "request_changes" | "block" | "revise";

export interface StudentProfile {
  display_name: string;
  grade: string;
  language: string;
  timezone?: string;
}

export interface HomeworkMetrics {
  active_questions: number;
  mistakes_total: number;
  due_reviews: number;
  papers_generated: number;
  mastery_score: number;
  questions_analyzed: number;
}

export interface QuestionExplanation {
  kid_summary: string;
  steps: string[];
  key_concept: string;
  self_check: string;
  next_hint: string;
}

export interface HomeworkQuestion {
  question_id: string;
  ref: number;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  source: "photo" | "text" | "paper";
  status: WorkflowStatus;
  difficulty: "easy" | "medium" | "challenge";
  photo_label?: string;
  prompt_text: string;
  student_answer: string;
  correct_answer: string;
  outcome: QuestionOutcome;
  confidence: number;
  created_at: string;
  tags: string[];
  explanation: QuestionExplanation;
  mistake_id?: string;
}

export interface MistakeAnalysis {
  root_cause: string;
  misconception: string;
  fix_strategy: string;
  similar_prompt: string;
  parent_note: string;
}

export interface MistakeItem {
  mistake_id: string;
  question_id: string;
  ref: number;
  subject: string;
  topic: string;
  mistake_type: string;
  status: WorkflowStatus;
  last_seen: string;
  next_review_at: string;
  attempts: number;
  review_history: string[];
  analysis: MistakeAnalysis;
}

export interface PracticePaper {
  paper_id: string;
  ref: number;
  title: string;
  subject: string;
  grade: string;
  status: WorkflowStatus;
  generated_at: string;
  focus_topics: string[];
  linked_mistakes: string[];
  question_count: number;
  estimated_minutes: number;
  difficulty_mix: Record<string, number>;
  items: string[];
  analysis: {
    wrong_count: number;
    strengths: string[];
    review_plan: string[];
    deep_notes: string;
  };
}

export interface ReviewItem {
  review_id: string;
  ref: number;
  target_type: "question" | "mistake" | "paper";
  target_id: string;
  title: string;
  status: WorkflowStatus;
  summary: string;
  risk: string[];
  proposed_action: string;
  reason: string;
  suggestions: string[];
  suggested_note: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  actor: string;
  detail: string;
}

export interface HomeworkSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  profile: StudentProfile;
  metrics: HomeworkMetrics;
  questions: HomeworkQuestion[];
  mistakes: MistakeItem[];
  papers: PracticePaper[];
  review_items: ReviewItem[];
  activity_log: ActivityEntry[];
  warnings: { id: string; severity: string; message: string }[];
}

export interface DecisionBody {
  review_id?: string;
  target_id?: string;
  action?: DecisionAction | string;
  comment?: string;
  edited_note?: string;
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<
    string,
    {
      action: string;
      comment: string;
      edited_note?: string;
      decided_at: string;
    }
  >;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: {
    task_id: string;
    type: "explain_again" | "generate_practice" | "revise_paper" | "review_mistake";
    review_id: string;
    target_id: string;
    ref: number;
    comment: string;
    requested_at: string;
    status: "queued" | "done";
  }[];
}

export interface ExecutionReport {
  executed_at: string;
  dry_run: boolean;
  source: string;
  results: Record<string, unknown>[];
}

export interface Onboarding {
  completed?: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

export interface ProviderChoice {
  provider?: string;
  selected_at?: string;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  student_profile: StudentProfile;
  subjects: string[];
  learning_policy: Record<string, unknown>;
  practice_defaults: Record<string, unknown>;
  export: Record<string, unknown>;
}

export interface SetupState {
  provider_selected: boolean;
  provider_env_locked: boolean;
  provider: string;
  state: "choose_provider" | "needs_config" | "ready";
  recommended_config: string;
  recommended_env: string;
  example_config: string;
  missing_env: string[];
}

export interface HomeworkState {
  app: "kelly-homework-coach";
  data_provider: string;
  setup: SetupState;
  onboarding: Onboarding;
  lock: Lock | null;
  config_summary: ConfigSummary;
  decisions: DecisionsFile;
  agent_tasks: AgentTasksFile;
  execution_report: ExecutionReport | null;
  snapshot: HomeworkSnapshot;
}
