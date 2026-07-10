// Domain shapes shared across the server, provider, and scripts.

import type { ScenarioInput, ScenarioResult } from "../../lib/simulate.ts";

export type Decision = "approve_underwriting" | "needs_revision" | "reject" | null;

export interface ScenarioDecision {
  action: Decision;
  note: string;
  decided_at: string | null;
}

export interface Scenario {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  input: ScenarioInput;
  result: ScenarioResult;
  decision: ScenarioDecision;
}

export interface ScenarioBatch {
  batch_id: string;
  generated_at: string;
  source: string;
  mode: "app-in-skill";
  metrics: {
    total: number;
    approved: number;
    needs_revision: number;
    rejected: number;
    undecided: number;
  };
  scenarios: Scenario[];
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface UnderwritingPolicy {
  max_effective_annual_cost_pct: number;
  min_cap_multiple: number;
  max_cap_multiple: number;
  max_term_months: number;
}

export interface Config {
  base_currency?: string;
  data_provider?: string;
  underwriting_policy?: UnderwritingPolicy;
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
  base_currency: string;
  data_provider: string;
  underwriting_policy: UnderwritingPolicy;
}
