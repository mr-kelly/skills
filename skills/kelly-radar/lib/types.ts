// Core domain types shared across the kelly-radar data-provider layer, the Hono
// server, and the scripts. These model the ACTUAL shapes produced by demo.ts /
// the providers / decisions.ts and the normalized radar snapshot validated in
// scripts/validate_ui_schema.ts (competitor monitoring + research workbench with
// brief approval + trend tracking).

export type SourceKind = "pricing" | "changelog" | "landing" | "launch" | "reviews" | "news" | "hiring" | "community";
export type Severity = "high" | "medium" | "low";
export type SignalStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type TargetType = "competitor" | "category" | "keyword" | "community";
export type TargetStatus = "ok" | "warning" | "stale" | "paused";
export type QuestionStatus = "brief_needs_review" | "researching" | "report_ready" | "annotated" | "closed";
export type BriefStatus = "needs_review" | "approved" | "changes_requested" | "blocked";
export type MoverSource = "search" | "community" | "category";
export type OpportunityStatus = "needs_review" | "approved" | "done" | "blocked";
export type Depth = "quick" | "standard" | "deep";
export type SourceMethod = "browser_agent" | "manual";
export type DecisionKind = "signal" | "brief" | "opportunity" | "report";
export type DecisionAction = "approve" | "watch" | "ignore" | "block" | "request_changes";
export type ProposedAction = "act" | "watch" | "ignore" | "needs_info";

export interface Evidence {
  title: string;
  url: string;
}

export interface DiffLine {
  type: "context" | "added" | "removed" | string;
  text: string;
}

export interface Diff {
  before_label?: string;
  after_label?: string;
  lines: DiffLine[];
}

export interface Handoff {
  operation: string;
  target?: string;
  summary?: string;
}

export interface Triage {
  kind?: string;
  action?: DecisionAction | string;
  status?: string;
  comment?: string;
  confidence?: number;
  decided_at?: string;
}

export interface Source {
  source_id: string;
  kind: SourceKind | string;
  url: string;
  method: SourceMethod | string;
  last_check_at: string;
  last_change_at: string;
}

export interface WatchTarget {
  target_id: string;
  name: string;
  type: TargetType | string;
  status: TargetStatus | string;
  notes: string;
  last_check_at: string;
  signals_7d: number;
  sources: Source[];
}

export interface Signal {
  signal_id: string;
  target_id: string;
  source_id: string;
  source_kind: SourceKind | string;
  severity: Severity | string;
  detected_at: string;
  status: SignalStatus | string;
  headline: string;
  summary: string;
  why_it_matters: string;
  content_hash: string;
  evidence: Evidence[];
  proposed_action?: ProposedAction | string;
  handoff?: Handoff;
  diff?: Diff;
  triage?: Triage;
}

export interface Followup {
  followup_id: string;
  question: string;
  status: string;
  asked_at: string;
}

export interface ResearchQuestion {
  question_id: string;
  question: string;
  status: QuestionStatus | string;
  asked_at: string;
  depth: Depth | string;
  cost_note: string;
  brief_id: string;
  report_id: string;
  confidence: number | null;
  followups: Followup[];
}

export interface Brief {
  brief_id: string;
  question_id: string;
  status: BriefStatus | string;
  drafted_at: string;
  depth: Depth | string;
  scope: string;
  planned_sources: string[];
  expected_deliverable?: string;
  notes?: string;
  triage?: Triage;
}

export interface ReportSource {
  source_id: string;
  title: string;
  url: string;
  accessed_at?: string;
}

export interface ReportSection {
  section_id: string;
  heading: string;
  body: string;
  source_ids: string[];
}

export interface ReportAnnotation {
  annotation_id: string;
  author: string;
  at: string;
  section_id: string;
  text: string;
}

export interface Report {
  report_id: string;
  question_id: string;
  title: string;
  filed_at: string;
  summary: string;
  confidence: number | null;
  sections: ReportSection[];
  sources: ReportSource[];
  annotations: ReportAnnotation[];
  triage?: Triage;
}

export interface Research {
  questions: ResearchQuestion[];
  briefs: Brief[];
  reports: Report[];
}

export interface Mover {
  mover_id: string;
  keyword: string;
  source: MoverSource | string;
  volume_proxy: number;
  delta_pct: number;
  momentum: number[];
  first_seen: string;
  last_updated: string;
  opportunity_id: string;
}

export interface Opportunity {
  opportunity_id: string;
  title: string;
  mover_ids: string[];
  status: OpportunityStatus | string;
  created_at: string;
  rationale: string;
  proposed_next_step: Handoff;
  triage?: Triage;
}

export interface Trends {
  movers: Mover[];
  opportunities: Opportunity[];
}

export interface SyncLogEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface RadarMetrics {
  watch_target_count: number;
  signal_count: number;
  signals_needs_review: number;
  questions_open: number;
  briefs_needs_review: number;
  reports_ready: number;
  trend_mover_count: number;
  opportunities_open: number;
}

export interface RadarSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  demo_scenario?: string;
  range: { start: string; end: string };
  metrics: RadarMetrics;
  watchlist: WatchTarget[];
  signals: Signal[];
  research: Research;
  trends: Trends;
  sync_log: SyncLogEntry[];
}

// ---- Decisions ----

export interface Decision {
  kind: DecisionKind | string;
  action: DecisionAction | string;
  status: string;
  comment: string;
  decided_at: string;
  confidence?: number;
}

export interface DecisionsFile {
  updated_at: string;
  decisions: Record<string, Decision>;
}

export interface DecisionBody {
  id?: string;
  kind?: string;
  action?: string;
  comment?: string;
  confidence?: number | string;
  question_id?: string;
  question?: string;
  demo?: string | boolean;
}

export interface AgentTaskEntry {
  kind: string;
  ref_id: string;
  note: string;
  created_at: string;
}

export interface AgentTask {
  task_id: string;
  status: string;
  kind: string;
  ref_id: string;
  note: string;
  created_at: string;
}

export interface AgentTasksFile {
  updated_at: string;
  tasks: AgentTask[];
}

export interface Lock {
  owner: string;
  message: string;
  started_at?: string;
}

// ---- Config ----

export interface ConfigProduct {
  name?: string;
  positioning?: string;
}

export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

export interface Config {
  data_provider?: string;
  watchlist?: unknown[];
  trend_sources?: unknown[];
  research?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  cadence?: Record<string, unknown>;
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummary {
  provider?: string;
  config_path: string;
  is_example: boolean;
  profile: {
    products: { name: string; positioning: string }[];
  };
  watchlist: {
    target_id: string;
    name: string;
    type: string;
    source_count: number;
    methods: string[];
  }[];
  research_defaults: {
    default_depth: string;
    source_policy: string;
    require_citations: boolean;
    max_sources: number;
  };
  trend_sources: {
    source_id: string;
    kind: string;
    name: string;
    method: string;
  }[];
  cadence: Record<string, unknown>;
  env_readiness: { name: string; ready: boolean }[];
  busabase?: {
    base_url: string | null;
    base_id: string | null;
    api_key: string;
  };
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

// ---- Demo ----

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

// ---- Provider layer ----

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers so a
// provider can surface its config source and (for busabase) its base_* settings.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
  configResult?: ConfigResult;
}

// Error carrying an HTTP status code. Matches the runtime shape used by the Hono
// server: DecisionResult.status, or a thrown Error with a `.statusCode`.
export interface HttpError extends Error {
  statusCode?: number;
}
