// Core domain types for the Agent Eval & Regression Board. These model a fixed
// suite of mock test cases scored against a rubric (helpfulness, correctness,
// safety, tone) for a baseline agent version vs a candidate agent version.
// Scores are deterministic mock values presented as if produced by an eval
// rubric — this is NOT a real LLM-judge call.

export type RubricKey = "helpfulness" | "correctness" | "safety" | "tone";

export type RubricScores = Record<RubricKey, number>;

export type CaseStatus = "needs_review" | "approved" | "done" | "blocked";

export type DecisionAction = "mark_blocking" | "mark_acceptable";

export interface CaseRun {
  transcript: string;
  scores: RubricScores;
  overall: number;
  pass: boolean;
}

export interface Decision {
  action: DecisionAction;
  note: string;
  decided_at: string;
}

export interface EvalCase {
  id: string;
  title: string;
  category: string;
  prompt: string;
  baseline: CaseRun;
  candidate: CaseRun;
  regression: boolean;
  improvement: boolean;
  status: CaseStatus;
  decision?: Decision;
}

export interface EvalMetrics {
  total_cases: number;
  baseline_pass: number;
  candidate_pass: number;
  baseline_pass_rate: number;
  candidate_pass_rate: number;
  regressions: number;
  improvements: number;
  blocking: number;
  acceptable: number;
  pending_review: number;
}

export interface EvalRun {
  run_id: string;
  generated_at: string;
  source: string;
  mode: string;
  baseline_version: string;
  candidate_version: string;
  metrics: EvalMetrics;
  cases: EvalCase[];
}

export interface ReleaseDecision {
  decision: "approve" | "block";
  note: string;
  decided_at: string;
  decided_by?: string;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

// ---- Config ----

export interface Config {
  base_currency?: string;
  data_provider?: string;
  team_name?: string;
  baseline_version?: string;
  candidate_version?: string;
  release_policy?: {
    blocking_regression_blocks_release?: boolean;
    min_candidate_pass_rate?: number;
  };
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
  team_name: string;
  baseline_version: string;
  candidate_version: string;
  release_policy: {
    blocking_regression_blocks_release: boolean;
    min_candidate_pass_rate: number;
  };
}
