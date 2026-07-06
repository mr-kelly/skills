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

// ─── ECHO publishing side (Explore / Craft / Host / Observe) ────────────────
// The monitoring half above stays as-is. The types below model the publishing
// desk: agent drafts → human approves → skill publishes. All new state travels
// through the SAME data-provider surface; the app never writes remote systems.

// Five-state review model shared by drafts, shorts, and engagement replies.
export type ReviewStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";

// social-qa quality gate verdict (SQS = Social Quality Score axes).
export type GateVerdict = "SHIP" | "FIX" | "BLOCK";

export interface GateCheck {
  id: string;
  label: string;
  // pass | warn | fail map to SHIP-safe | FIX | BLOCK contributions.
  result: "pass" | "warn" | "fail";
  note?: string;
}

export interface QualityGate {
  verdict: GateVerdict;
  score: number; // 0-100 Social Quality Score
  checks: GateCheck[];
  summary?: string;
}

// A scheduled slot on the content calendar (theme pillar + date + status).
export interface CalendarEntry {
  entry_id: string;
  date: string; // YYYY-MM-DD
  channel: Platform;
  pillar: string; // theme pillar, e.g. "build-in-public"
  title: string;
  status: "planned" | "drafting" | "scheduled" | "published" | "skipped";
  draft_id?: string; // link to a composer draft when one exists
  scheduled_for?: string; // ISO timestamp for the intended publish moment
  notes?: string;
}

// An agent-drafted post awaiting human review in the composer queue.
export interface PostDraft {
  draft_id: string;
  channels: Platform[]; // target channels
  pillar: string;
  hook: string;
  body: string;
  hashtags: string[];
  cta: string;
  status: ReviewStatus;
  scheduled_for?: string; // ISO timestamp when approved-for-schedule
  gate: QualityGate; // pre-publish social-qa result
  agent_notes?: string;
  review_note?: string; // human note on changes_requested / approval
  created_at: string;
  updated_at: string;
}

// One shot in a short-video script.
export interface Shot {
  shot_no: number;
  visual: string; // what is on screen
  voiceover: string; // the VO line for this shot
  duration_s: number;
  on_screen_text?: string;
}

// A short-video script for Reels / Shorts / TikTok / Douyin.
export interface ShortScript {
  short_id: string;
  channels: Platform[];
  pillar: string;
  title: string;
  hook: string;
  status: ReviewStatus;
  duration_s: number;
  shots: Shot[];
  caption?: string;
  hashtags?: string[];
  agent_notes?: string;
  review_note?: string;
  created_at: string;
  updated_at: string;
}

// An incoming mention / comment with an agent-drafted reply (approval-gated).
export interface EngagementItem {
  item_id: string;
  platform: Platform;
  account_id?: string; // which of our accounts it landed on
  kind: "mention" | "comment" | "dm" | "reply";
  author_handle: string;
  incoming_text: string;
  received_at: string;
  sentiment: "positive" | "neutral" | "negative" | "question";
  priority: "low" | "normal" | "high";
  draft_reply: string; // agent-drafted reply
  status: ReviewStatus;
  review_note?: string;
  permalink?: string;
}

// One step in the crisis / incident-response playbook.
export interface CrisisStep {
  step_id: string;
  label: string;
  detail: string;
  owner?: string;
  done: boolean;
}

// The static-mostly crisis playbook with a live status toggle.
export interface CrisisPlaybook {
  status: "calm" | "watch" | "active";
  publishing_paused: boolean;
  spokesperson?: string;
  updated_at?: string;
  steps: CrisisStep[];
}

// Share-of-voice: us vs competitors, projected from monitoring data.
export interface VoiceShare {
  name: string;
  is_self: boolean;
  mentions_7d: number;
  share: number; // 0-1 fraction of total mentions
}

export interface ShareOfVoice {
  window: string; // e.g. "7d"
  total_mentions: number;
  entries: VoiceShare[];
}

// A publishing-desk operation the app POSTs to /api/operation. The app writes
// local files only; real publishing/replying is skill-executed post-approval.
export type PublishingOperation =
  | { operation: "review_draft"; draft_id: string; status: ReviewStatus; review_note?: string }
  | { operation: "review_short"; short_id: string; status: ReviewStatus; review_note?: string }
  | { operation: "review_engagement"; item_id: string; status: ReviewStatus; review_note?: string }
  | { operation: "publish_post"; draft_id: string; channel?: Platform; scheduled_for?: string }
  | { operation: "send_reply"; item_id: string; channel?: Platform }
  | {
      operation: "crisis_toggle";
      status?: CrisisPlaybook["status"];
      publishing_paused?: boolean;
      step_id?: string;
      done?: boolean;
    };

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
  // ECHO publishing side (all optional so pre-existing snapshots stay valid).
  calendar?: CalendarEntry[];
  drafts?: PostDraft[];
  shorts?: ShortScript[];
  engagement?: EngagementItem[];
  crisis?: CrisisPlaybook;
  share_of_voice?: ShareOfVoice;
}
