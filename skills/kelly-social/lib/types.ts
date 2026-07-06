// Shared types for the kelly-social data-provider layer. The domain shapes
// (snapshot / accounts / posts / sync log) are re-exported from the server's
// types module so there is a single source of truth for the normalized snapshot
// in app/.data/social_snapshot.json. The types added here model the provider
// selection + config surface (a read-mostly social monitoring dashboard).

export type {
  Account,
  AccountMetrics,
  CalendarEntry,
  CollectionMethod,
  CrisisPlaybook,
  CrisisStep,
  DateRange,
  EngagementItem,
  FollowerPoint,
  GateCheck,
  GateVerdict,
  MediaKind,
  Platform,
  Post,
  PostDraft,
  PostMetrics,
  PublishingOperation,
  QualityGate,
  ReviewStatus,
  ShareOfVoice,
  ShortScript,
  Shot,
  SnapshotMetrics,
  SocialSnapshot,
  SyncEntry,
  SyncStatus,
  TrafficSource,
  VoiceShare,
  Warning,
} from "../app/server/types.ts";

// One configured account as it appears in config.local.json / config.example.json.
export interface AccountConfig {
  account_id?: string;
  platform?: string;
  handle?: string;
  display_name?: string;
  profile_url?: string;
  collection?: string;
  export_dir?: string;
  api_token_env?: string;
  api_key_env?: string;
  api_secret_env?: string;
  access_token_env?: string;
  [key: string]: unknown;
}

export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

// Config as loaded from config.local.json / config.example.json / env.
export interface Config {
  data_provider?: string;
  locale?: string;
  accounts?: AccountConfig[];
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Onboarding marker persisted in app/.data/onboarding.json.
export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
  [key: string]: unknown;
}

// Lock file guarding writes while an agent collects a snapshot.
export interface Lock {
  owner?: string;
  message?: string;
  started_at?: string;
  [key: string]: unknown;
}

// Sanitized per-account setup summary shown on the #/settings screen.
export interface AccountSummary {
  account_id: string;
  platform: string;
  handle: string;
  display_name: string;
  collection: string;
  secret_envs: string[];
  secrets_ready: boolean;
}

export interface ConfigSummary {
  provider?: string;
  config_path: string;
  is_example: boolean;
  accounts: AccountSummary[];
  [key: string]: unknown;
}

// The aggregate /api/state payload the UI consumes.
export interface SocialState {
  data_provider: string;
  onboarding: Onboarding;
  lock: Lock | null;
  config_summary: ConfigSummary;
  snapshot: import("../app/server/types.ts").SocialSnapshot;
}

// Error carrying an HTTP status code, thrown by providers and read by Hono.
export interface HttpError extends Error {
  statusCode?: number;
}
