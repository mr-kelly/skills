export interface BusabaseConfig {
  base_url?: string;
  space_id?: string;
  api_key_env?: string;
  drive_node_id?: string;
  drive_node_slug?: string;
  featured_base_id?: string;
  featured_base_slug?: string;
  notices_base_id?: string;
  notices_base_slug?: string;
  /** Legacy alias for notices_base_id. */
  news_base_id?: string;
  /** Legacy alias for notices_base_slug. */
  news_base_slug?: string;
  qa_base_id?: string;
  qa_base_slug?: string;
  feedback_base_id?: string;
  feedback_base_slug?: string;
  record_limit?: number | string;
}

export interface OperatorConfig {
  name?: string;
  role?: string;
  timezone?: string;
}

export interface FieldMapping {
  [key: string]: string | undefined;
}

export interface TaxonomyConfig {
  file_metadata_fields?: string[];
  qa_fields?: FieldMapping;
  featured_fields?: FieldMapping;
  notices_fields?: FieldMapping;
  /** Legacy shared mapping for both information collections. */
  news_fields?: FieldMapping;
  feedback_fields?: FieldMapping;
}

export interface Config {
  data_provider?: string;
  locale?: string;
  busabase?: BusabaseConfig;
  operator?: OperatorConfig;
  taxonomy?: TaxonomyConfig;
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
  provider?: string;
  operator: OperatorConfig;
  busabase: {
    base_url: string;
    space_id: string;
    api_key_env: string;
    api_key_ready: boolean;
    drive_node_id: string;
    drive_node_slug: string;
    featured_base_id: string;
    featured_base_slug: string;
    notices_base_id: string;
    notices_base_slug: string;
    news_base_id: string;
    news_base_slug: string;
    qa_base_id: string;
    qa_base_slug: string;
    feedback_base_id: string;
    feedback_base_slug: string;
    record_limit: number;
  };
  taxonomy: {
    file_metadata_fields: string[];
    qa_fields: FieldMapping;
    featured_fields: FieldMapping;
    notices_fields: FieldMapping;
    news_fields: FieldMapping;
    feedback_fields: FieldMapping;
  };
}

export interface MetadataField {
  key: string;
  value: unknown;
}

export interface InsureFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
  updated_at: string;
  asset_id?: string;
  url?: string;
  metadata: Record<string, unknown>;
  governance?: Governance;
}

export interface Governance {
  completeness_pct: number;
  missing_fields: string[];
  status: string;
}

export interface QaPair {
  id: string;
  question: string;
  answer: string;
  category: string;
  source: string;
  tags: string[];
  updated_at: string;
  status: string;
  fields: Record<string, unknown>;
  governance?: Governance;
}

export interface NewsItem {
  id: string;
  collection: "featured" | "notice";
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at: string;
  category: string;
  tags: string[];
  status: string;
  fields: Record<string, unknown>;
  governance?: Governance;
}

export interface FeedbackItem {
  id: string;
  title: string;
  content: string;
  source: string;
  user_name: string;
  contact: string;
  rating: string;
  category: string;
  tags: string[];
  created_at: string;
  status: string;
  fields: Record<string, unknown>;
  governance?: Governance;
}

export interface InsureMetrics {
  file_count: number;
  metadata_field_count: number;
  qa_count: number;
  featured_count: number;
  notice_count: number;
  news_count: number;
  feedback_count: number;
  total_records: number;
  data_quality_score?: number;
  needs_governance?: number;
}

export interface BaseSummary {
  base_id: string;
  name: string;
  slug: string;
  fields: MetadataField[];
}

export interface InsureSnapshot {
  schema_version: string;
  generated_at: string;
  source: string;
  drive: {
    node_id: string;
    name: string;
    slug: string;
    metadata: Record<string, unknown>;
    metadata_fields: MetadataField[];
  };
  bases: {
    featured: BaseSummary;
    notices: BaseSummary;
    qa: BaseSummary;
    feedback: BaseSummary;
  };
  metrics: InsureMetrics;
  files: InsureFile[];
  qa_pairs: QaPair[];
  news_items: NewsItem[];
  featured_items: NewsItem[];
  notice_items: NewsItem[];
  feedback_items: FeedbackItem[];
  warnings: { id: string; severity: "info" | "warning" | "error"; message: string }[];
}

export interface InsureState {
  app: "kelly-insure-data";
  data_provider: string;
  config_summary: ConfigSummary;
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  snapshot: InsureSnapshot;
  demo?: boolean;
  demo_scenario?: string;
}
