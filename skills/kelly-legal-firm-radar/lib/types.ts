export const APP_ID = "kelly-legal-firm-radar";
export const APP_TITLE = "Legal Firm Radar";
export const APP_TITLE_ZH = "律所经营画像台";
export const APP_SUBTITLE = "Practice analytics and lawyer profiles";
export const APP_SUBTITLE_ZH = "业务布局、质量评估与律师画像";
export const ENV_PREFIX = "KELLY_LEGAL_FIRM_RADAR";
export const SNAPSHOT_FILE = "firm_radar_snapshot.json";
export const ITEM_LABEL_EN = "Insight";
export const ITEM_LABEL_ZH = "洞察";
export const ENTITY_LABEL_EN = "analytics cards";
export const ENTITY_LABEL_ZH = "分析卡";
export const HUMAN_TASK_EN = "Need partner review";
export const HUMAN_TASK_ZH = "待管理层复核";
export const READY_LABEL_EN = "Approved reports";
export const READY_LABEL_ZH = "已批准报告";
export const BLOCKED_LABEL_EN = "Blocked insights";
export const BLOCKED_LABEL_ZH = "已拦截洞察";
export const EXECUTE_OPERATION = "approve_management_report";
export const EXPORT_OPERATION = "export_management_report";
export const INGEST_SCRIPT = "import_metrics.ts";
export const EXPORT_SCRIPT = "export_management_report.ts";

export type ReviewStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type CheckStatus = "pass" | "warn" | "fail";
export type DecisionAction = "approve" | "request_changes" | "revise" | "block";

export interface Workspace {
  title: string;
  title_zh?: string;
  subtitle?: string;
  subtitle_zh?: string;
  firm?: string;
  jurisdiction?: string;
  [key: string]: unknown;
}

export interface MetricSet {
  items_total: number;
  needs_review: number;
  changes_requested: number;
  approved: number;
  done: number;
  blocked: number;
  checks_failed: number;
  [key: string]: unknown;
}

export interface EntityCard {
  id: string;
  title: string;
  meta?: string;
  status?: ReviewStatus | string;
  owner?: string;
  summary?: string;
  tags?: string[];
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReviewItem {
  id: string;
  ref: string;
  title: string;
  category?: string;
  status: ReviewStatus;
  owner?: string;
  risk?: string[];
  summary: string;
  body?: string;
  recommendation?: string;
  proposed_action?: string;
  draft?: string;
  evidence?: string[];
  fields?: Record<string, unknown>;
  decided_at?: string;
  review_note?: string;
  [key: string]: unknown;
}

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  item_id?: string;
  severity?: string;
  [key: string]: unknown;
}

export interface ActivityLogEntry {
  at: string;
  actor: string;
  action: string;
  detail?: string;
  count?: number;
  [key: string]: unknown;
}

export interface Snapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  workspace: Workspace;
  metrics: MetricSet;
  entities: EntityCard[];
  items: ReviewItem[];
  checks: CheckItem[];
  activity_log: ActivityLogEntry[];
  warnings?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface Decision {
  action: DecisionAction;
  comment?: string;
  draft?: string;
  fields?: Record<string, unknown>;
  decided_at: string;
  [key: string]: unknown;
}

export interface DecisionsFile {
  schema_version: string;
  updated_at: string;
  decisions: Record<string, Decision>;
  [key: string]: unknown;
}

export interface AgentTasksFile {
  schema_version: string;
  updated_at: string;
  tasks: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface ExecutionReport {
  schema_version: string;
  executed_at: string;
  dry_run: boolean;
  source: string;
  results: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Record<string, unknown>;
  path: string;
  is_example: boolean;
}
