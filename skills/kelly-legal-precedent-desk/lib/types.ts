export const APP_ID = "kelly-legal-precedent-desk";
export const APP_TITLE = "Legal Precedent Desk";
export const APP_TITLE_ZH = "类案检索与裁判尺度台";
export const APP_SUBTITLE = "Internal precedents and local court patterns";
export const APP_SUBTITLE_ZH = "内部类案与本地裁判尺度";
export const ENV_PREFIX = "KELLY_LEGAL_PRECEDENT_DESK";
export const SNAPSHOT_FILE = "precedent_snapshot.json";
export const ITEM_LABEL_EN = "Pack";
export const ITEM_LABEL_ZH = "类案包";
export const ENTITY_LABEL_EN = "precedent packs";
export const ENTITY_LABEL_ZH = "类案包";
export const HUMAN_TASK_EN = "Need precedent review";
export const HUMAN_TASK_ZH = "待类案复核";
export const READY_LABEL_EN = "Approved packs";
export const READY_LABEL_ZH = "已批准类案包";
export const BLOCKED_LABEL_EN = "Blocked findings";
export const BLOCKED_LABEL_ZH = "已拦截发现";
export const EXECUTE_OPERATION = "approve_research_pack";
export const EXPORT_OPERATION = "export_research_pack";
export const INGEST_SCRIPT = "create_research_batch.ts";
export const EXPORT_SCRIPT = "export_research_pack.ts";

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
