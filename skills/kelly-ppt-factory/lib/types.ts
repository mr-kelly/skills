export type WorkflowStatus =
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "generated"
  | "done"
  | "blocked"
  | string;
export type DecisionAction = "approve" | "request_changes" | "block" | "revise" | string;
export type SlideType =
  | "cover"
  | "warmup"
  | "vocabulary"
  | "dialogue"
  | "image_prompt"
  | "practice"
  | "game"
  | "summary"
  | string;

export interface BrandProfile {
  client_id: string;
  name: string;
  audience: string;
  language_mode: string;
  style_system_id: string;
}

export interface StyleSystem {
  style_system_id: string;
  name: string;
  palette: string[];
  fonts: { heading: string; body: string; chinese?: string };
  visual_rules: string[];
  layout_rules: string[];
  component_library: string[];
}

export interface Project {
  project_id: string;
  ref: number;
  client_id: string;
  title: string;
  course: string;
  stage: string;
  owner: string;
  status: WorkflowStatus;
  deck_count: number;
  slide_count: number;
  due_at?: string;
  updated_at?: string;
}

export interface Deck {
  deck_id: string;
  ref: number;
  project_id: string;
  title: string;
  theme: string;
  level: string;
  audience: string;
  status: WorkflowStatus;
  target_slide_count: number;
  approved_slide_count: number;
  generated_slide_count: number;
  style_score: number;
  pptx_path?: string;
  render_path?: string;
  updated_at?: string;
}

export interface SlideContent {
  title?: string;
  subtitle?: string;
  chinese?: string;
  pinyin?: string;
  english?: string;
  bullets?: string[];
  teacher_notes?: string;
  interaction?: string;
  image_prompt?: string;
}

export interface SlideCard {
  slide_id: string;
  ref: number;
  deck_id: string;
  project_id: string;
  status: WorkflowStatus;
  slide_type: SlideType;
  layout: string;
  title: string;
  objective: string;
  content: SlideContent;
  asset_brief: string;
  style_checks: string[];
  qa_flags: string[];
  updated_at?: string;
}

export interface QaCheck {
  check_id: string;
  target_id: string;
  target_type: "deck" | "slide" | "export" | string;
  rule: string;
  result: "pass" | "warn" | "fail" | "manual" | string;
  evidence: string;
  checked_at: string;
}

export interface ExportRecord {
  export_id: string;
  deck_id: string;
  status: "pending" | "generated" | "qa_failed" | "done" | "blocked" | string;
  format: "pptx" | "pdf" | "png" | string;
  path: string;
  generated_at?: string;
  qa_summary?: string;
}

export interface ReviewItem {
  review_id: string;
  ref: number;
  target_type: "deck" | "slide" | "export" | string;
  target_id: string;
  status: WorkflowStatus;
  summary: string;
  suggestions: string[];
  draft_note: string;
  created_at?: string;
}

export interface Activity {
  id: string;
  at: string;
  actor: string;
  detail: string;
  target_id?: string;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  target_id?: string;
  detail?: string;
}

export interface Metrics {
  project_count: number;
  deck_count: number;
  slide_count: number;
  slides_needs_review: number;
  slides_approved: number;
  decks_generated: number;
  qa_warnings: number;
  avg_style_score: number;
}

export interface PptFactorySnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  brand_profiles: BrandProfile[];
  style_systems: StyleSystem[];
  projects: Project[];
  decks: Deck[];
  slide_cards: SlideCard[];
  qa_checks: QaCheck[];
  exports: ExportRecord[];
  review_items: ReviewItem[];
  activity_log: Activity[];
  warnings: Warning[];
  metrics: Metrics;
}

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

export interface DecisionBody {
  action?: string;
  review_id?: string;
  target_id?: string;
  comment?: string;
  draft?: string;
}

export interface AgentTask {
  task_id: string;
  type: string;
  review_id: string;
  target_type: string;
  target_id: string;
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

export interface ExecutionResult {
  review_id: string;
  target_type: string;
  target_id: string;
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

export interface Lock {
  owner?: string;
  message?: string;
  started_at?: string;
  [key: string]: unknown;
}

export interface Onboarding {
  completed?: boolean;
  completed_at?: string;
  config_version?: string;
  [key: string]: unknown;
}

export interface ConfigBrandProfile {
  client_id?: string;
  name?: string;
  audience?: string;
  language_mode?: string;
  style_system_id?: string;
}

export interface ConfigStyleSystem {
  style_system_id?: string;
  name?: string;
  palette?: string[];
  fonts?: { heading?: string; body?: string; chinese?: string };
  visual_rules?: string[];
  layout_rules?: string[];
  component_library?: string[];
}

export interface ConfigExport {
  out_dir?: string;
  render_dir?: string;
  pptx_template?: string;
  require_render_qa?: boolean;
}

export interface Config {
  data_provider?: string;
  brand_profiles?: ConfigBrandProfile[];
  style_systems?: ConfigStyleSystem[];
  default_brand_id?: string;
  export?: ConfigExport;
}

export interface ConfigResult {
  config: Config;
  path: string | null;
  is_example: boolean;
}

export interface ConfigSummary {
  config_path: string | null;
  is_example: boolean;
  default_brand_id: string;
  brand_profiles: BrandProfile[];
  style_systems: StyleSystem[];
  export: {
    out_dir: string;
    render_dir: string;
    pptx_template: string;
    require_render_qa: boolean;
  };
}

export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

export interface PptFactoryState {
  app: "kelly-ppt-factory";
  data_provider: string;
  onboarding: Onboarding;
  lock: Lock | null;
  config_summary: ConfigSummary;
  decisions: DecisionsFile;
  agent_tasks: AgentTasksFile;
  execution_report: ExecutionReport | null;
  snapshot: PptFactorySnapshot;
}
