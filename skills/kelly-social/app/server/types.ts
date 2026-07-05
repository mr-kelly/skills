// Core domain types shared across the kelly-social server, provider, and
// scripts. These model the ACTUAL shapes produced by demo.ts / store.ts and the
// normalized snapshot in app/.data/social_snapshot.json.

export type Platform =
  | "x"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "threads"
  | "tiktok"
  | "xiaohongshu"
  | "manual";
export type CollectionMethod = "browser_agent" | "api" | "manual_export";
export type MediaKind = "none" | "image" | "video" | "carousel" | "link";
export type SyncStatus = "ok" | "warning" | "error";

export interface FollowerPoint {
  date: string;
  followers: number;
}

export interface TrafficSource {
  source: string;
  share: number;
}

export interface AccountMetrics {
  followers: number;
  following: number;
  posts: number;
  impressions_7d: number;
  impressions_28d: number;
  engagements_7d: number;
  engagement_rate_7d: number;
  profile_visits_7d: number;
  followers_delta_7d: number;
  followers_delta_28d: number;
}

export interface Account {
  account_id: string;
  platform: Platform;
  handle: string;
  display_name: string;
  profile_url?: string;
  collection: CollectionMethod;
  status: string;
  notes?: string;
  metrics: AccountMetrics;
  follower_series: FollowerPoint[];
  traffic_sources: TrafficSource[];
  last_sync_at?: string;
}

export interface PostMetrics {
  likes: number;
  replies: number;
  reposts: number;
  views: number;
  saves?: number;
  clicks?: number;
}

export interface Post {
  post_id: string;
  platform: Platform;
  account_id: string;
  provider_post_id: string;
  posted_at: string;
  type: string;
  text: string;
  media: MediaKind;
  media_count: number;
  permalink: string;
  metrics: PostMetrics;
  engagement_rate: number;
  agent_notes: string;
  tags: string[];
}

export interface SyncEntry {
  sync_id: string;
  account_id: string;
  method: CollectionMethod;
  started_at: string;
  completed_at: string;
  status: SyncStatus | string;
  posts_collected: number;
  message: string;
  actor: string;
}

export interface SnapshotMetrics {
  account_count: number;
  post_count: number;
  total_followers: number;
  followers_delta_7d: number;
  followers_delta_28d: number;
  impressions_7d: number;
  engagements_7d: number;
  engagement_rate_7d: number;
}

export interface Warning {
  id: string;
  severity: string;
  message: string;
  account_id?: string;
  detail?: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface SocialSnapshot {
  schema_version: string;
  snapshot_id?: string;
  generated_at: string;
  source: string;
  range: DateRange;
  metrics: SnapshotMetrics;
  accounts: Account[];
  posts: Post[];
  sync_log: SyncEntry[];
  warnings: Warning[];
}
