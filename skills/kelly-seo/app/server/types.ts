// Core domain types shared across the kelly-seo server, demo scenes, and scripts.
// These model the ACTUAL shapes produced by demo.ts / store.ts and the snapshot
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
