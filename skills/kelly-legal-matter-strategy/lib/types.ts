export const APP_ID = "kelly-legal-matter-strategy";
export const APP_TITLE = "Legal Matter Strategy";
export const APP_TITLE_ZH = "案件策略与文书辅助台";
export const APP_SUBTITLE = "Strategy, evidence, and drafting plans";
export const APP_SUBTITLE_ZH = "争议策略、证据与文书方案";
export const ENV_PREFIX = "KELLY_LEGAL_MATTER_STRATEGY";
export const SNAPSHOT_FILE = "strategy_snapshot.json";
export const ITEM_LABEL_EN = "Strategy";
export const ITEM_LABEL_ZH = "策略项";
export const ENTITY_LABEL_EN = "strategy packs";
export const ENTITY_LABEL_ZH = "策略包";
export const HUMAN_TASK_EN = "Need partner judgment";
export const HUMAN_TASK_ZH = "待合伙人判断";
export const READY_LABEL_EN = "Ready to draft";
export const READY_LABEL_ZH = "可进入文书";
export const BLOCKED_LABEL_EN = "Blocked strategies";
export const BLOCKED_LABEL_ZH = "已拦截策略";
export const EXECUTE_OPERATION = "approve_strategy_pack";
export const EXPORT_OPERATION = "export_strategy_pack";
export const INGEST_SCRIPT = "create_strategy_batch.ts";
export const EXPORT_SCRIPT = "export_strategy_pack.ts";

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
