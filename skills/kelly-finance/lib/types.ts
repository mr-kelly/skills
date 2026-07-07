export type WorkflowStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";

export interface ModelPeriod {
  label: string;
  revenue: number;
  gross_profit: number;
  ebitda: number;
  net_income: number;
  ending_cash: number;
  total_assets: number;
  free_cash_flow: number;
}

export interface ModelCheck {
  id: string;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  status: WorkflowStatus;
  check_type: string;
  evidence: string[];
  proposed_action: string;
  draft: string;
  decision?: {
    action: string;
    comment?: string;
    decided_at: string;
  };
}

export interface FinanceSnapshot {
  snapshot_id: string;
  generated_at: string;
  source: "demo" | "local";
  company: string;
  currency: string;
  display_unit: string;
  model_purpose: string;
  periods: ModelPeriod[];
  metrics: {
    needs_review: number;
    approved: number;
    done: number;
    blocked: number;
    revenue_cagr: number;
    ending_cash: number;
    free_cash_flow: number;
    balance_check: number;
  };
  checks: ModelCheck[];
  warnings: string[];
  workbook?: {
    last_generated_path?: string;
    tabs: string[];
  };
}

export interface DecisionsFile {
  decisions: Record<string, ModelCheck["decision"]>;
}

export interface AgentTasksFile {
  tasks: Array<{ id: string; note: string; created_at: string }>;
}

export interface LockRecord {
  owner: string;
  message: string;
  started_at: string;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}
