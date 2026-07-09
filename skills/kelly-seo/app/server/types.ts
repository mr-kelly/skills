// Core domain types shared across the kelly-seo server, demo scenes, and scripts.
// These model the ACTUAL shapes produced by demo.ts / the data-provider layer and the snapshot
// consumed by scripts/validate_ui_schema.ts.

export type OpportunityStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type OpportunityType = "title_meta_rewrite" | "internal_links" | "content_brief" | "fix_page_issue";
export type DecisionAction = "approve" | "request_changes" | "revise" | "block";
export type Severity = "info" | "warning" | "high";

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export interface MetricBlock {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DateWindow {
  start: string;
  end: string;
}

export interface SnapshotRange {
  current: DateWindow;
  previous: DateWindow;
}

export interface SiteEntry {
  site_id: string;
  property_url: string;
  verification_type: string;
  permission_level?: string;
  status: string;
  last_sync_at?: string;
  totals: MetricBlock;
  previous: MetricBlock;
}

export interface DailyPoint {
  date: string;
  site_id: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface TrendPoint {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface TopPage {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface QueryEntry {
  query_id: string;
  site_id: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previous: MetricBlock;
  badges: string[];
  top_pages: TopPage[];
  trend: TrendPoint[];
  agent_notes: string;
}

export interface TopQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PageEntry {
  page_id: string;
  site_id: string;
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previous: MetricBlock;
  issues: string[];
  top_queries: TopQuery[];
  trend: TrendPoint[];
  agent_notes: string;
}

export interface Decision {
  action: string;
  note: string;
  draft: string | null;
  decided_at: string;
}

export interface Execution {
  status: string;
  operation: string;
  target: string;
  detail: string;
  executed_at: string;
}

export interface Opportunity {
  id: string;
  ref: number;
  site_id: string;
  type: OpportunityType;
  title: string;
  target_page: string;
  target_query: string;
  reason: string;
  expected_impact: string;
  draft: string;
  status: OpportunityStatus;
  agent_notes: string;
  created_at: string;
  decision: Decision | null;
  execution: Execution | null;
  /** Busabase change-request status, present only when this opportunity round-tripped through the busabase provider. */
  busabase_status?: string;
}

export interface SnapshotMetrics {
  site_count: number;
  query_count: number;
  page_count: number;
  opportunity_count: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prev_clicks: number;
  prev_impressions: number;
  prev_ctr: number;
  prev_position: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
}

// ── GEO (Generative Engine Optimization) ──────────────────────────────────────
// The AI-search side of the desk: are we cited in AI answer engines, how citable
// is a proposed change, and is the brand entity ready for a knowledge panel.

// The AI answer engines we track visibility across.
export type AiEngine = "chatgpt" | "perplexity" | "gemini" | "claude" | "copilot";

export type MentionSentiment = "positive" | "neutral" | "negative";

// geo-qa quality gate verdict (GQS = GEO Quality Score axes).
export type GeoGateVerdict = "SHIP" | "FIX" | "BLOCK";

export interface GeoGateCheck {
  id: string;
  label: string;
  // pass | warn | fail map to SHIP-safe | FIX | BLOCK contributions.
  result: "pass" | "warn" | "fail";
  note?: string;
}

export interface GeoGate {
  verdict: GeoGateVerdict;
  score: number; // 0-100 GEO Quality Score
  checks: GeoGateCheck[];
  summary?: string;
}

// One engine's answer for one tracked prompt: did it cite/mention the brand, at
// what rank in the answer, with what sentiment.
export interface EngineMention {
  engine: AiEngine;
  mentioned: boolean;
  position: number | null; // rank of the brand citation within the answer (1 = first), null when absent
  sentiment: MentionSentiment | null;
  cited_url: string; // which page (if any) the engine cited
  note: string;
}

// A tracked question/prompt we check across engines, plus a per-engine trend.
export interface TrackedPrompt {
  prompt_id: string;
  prompt: string; // the question a user might ask an AI engine
  intent: string; // short label, e.g. "comparison", "how-to"
  mentions: EngineMention[]; // one entry per engine
  trend: { date: string; visibility: number }[]; // 0-1 share of engines mentioning us, over time
}

export interface AiVisibility {
  brand: string; // the invented brand these prompts are about
  engines: AiEngine[]; // engines in the matrix, in display order
  score: number; // 0-100 overall AI visibility score
  prev_score: number; // same score in the previous window (for a delta)
  prompts: TrackedPrompt[];
}

export type GeoOpportunityType = "citable_rewrite" | "quotable_stats" | "qa_block" | "schema_markup";
export type GeoOpportunityStatus = OpportunityStatus;

// An agent-proposed GEO content optimization, reviewed with the same five-state
// model as SEO opportunities, but gated by geo-qa before it can ship.
export interface GeoOpportunity {
  id: string;
  ref: number;
  type: GeoOpportunityType;
  title: string;
  target_page: string;
  target_prompt: string; // the AI-engine question this change is meant to win
  reason: string;
  expected_impact: string;
  draft: string; // the proposed citable content / additions
  grounding: string[]; // kb-style source lines backing any claims in the draft
  gate: GeoGate; // geo-qa result on the draft
  status: GeoOpportunityStatus;
  agent_notes: string;
  created_at: string;
  decision: Decision | null;
  execution: Execution | null;
}

export type EntitySignalStatus = "present" | "partial" | "missing";

// One brand-entity / knowledge-panel readiness signal on the checklist.
export interface EntitySignal {
  id: string;
  label: string; // e.g. "Wikidata entity"
  category: string; // e.g. "knowledge-graph", "consistency", "schema"
  status: EntitySignalStatus;
  detail: string; // what was found
  fix: string; // agent-proposed fix when partial/missing
}

export interface EntityReadiness {
  brand: string;
  score: number; // 0-100 entity readiness score
  signals: EntitySignal[];
}

export interface SeoSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  range: SnapshotRange;
  metrics: SnapshotMetrics;
  sites: SiteEntry[];
  daily: DailyPoint[];
  queries: QueryEntry[];
  pages: PageEntry[];
  opportunities: Opportunity[];
  warnings: Warning[];
  // GEO / AI-search additions. Optional so pre-GEO snapshots still validate.
  ai_visibility?: AiVisibility | null;
  geo_opportunities?: GeoOpportunity[];
  entity_signals?: EntityReadiness | null;
}

// Raw source rows in demo.ts, spread into queryEntry()/pageEntry(). Tuple types
// so `queryEntry(...row)` / `pageEntry(...row, queries)` type-check.
export type QueryRow = [
  siteId: string,
  query: string,
  clicks: number,
  impressions: number,
  position: number,
  prevClicks: number,
  prevImpressions: number,
  prevPosition: number,
  pages: string[],
];

export type PageRow = [
  siteId: string,
  url: string,
  clicks: number,
  impressions: number,
  position: number,
  prevClicks: number,
  prevImpressions: number,
  prevPosition: number,
  issues: string[],
];
