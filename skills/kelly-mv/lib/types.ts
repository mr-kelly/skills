// Shared types for the kelly-mv data-provider layer, server, services, and
// scripts. These model the ACTUAL shapes produced by the local project store
// (project.json snapshot + config files) and the media it stores under
// app/.data/generated/. Kept loose (optional fields + index signatures) because
// projects on disk evolve and older projects carry legacy fields.

export type ReviewStatus = "draft" | "needs_review" | "changes_requested" | "approved" | "blocked";

export interface ReferenceCard {
  prompt?: string;
  image_asset?: string;
  status?: string;
  generated_at?: string;
  generation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CharacterVisual {
  front?: string;
  side?: string;
  back?: string;
  wardrobe?: string;
  anchors?: string[];
  forbidden_drift?: string[];
  [key: string]: unknown;
}

export interface Character {
  id: string;
  name?: string;
  role?: string;
  status?: string;
  actor_profile?: string;
  character_card?: Record<string, unknown>;
  visual?: CharacterVisual;
  reference_card?: ReferenceCard;
  [key: string]: unknown;
}

export interface AssetCandidate {
  path: string;
  generated_at: string;
  generation: Record<string, unknown>;
}

export interface Shot {
  id: string;
  title?: string;
  status?: string;
  duration_seconds?: number;
  duration_preset?: string;
  description?: string;
  video_prompt?: string;
  negative_prompt?: string;
  characters?: string[];
  image_asset?: string;
  image_generated_at?: string;
  image_generation?: Record<string, unknown>;
  image_candidates?: AssetCandidate[];
  video_asset?: string;
  video_generated_at?: string;
  video_generation?: Record<string, unknown>;
  video_candidates?: AssetCandidate[];
  // Legacy rich-sheet fields still read as prompt fallbacks.
  composition?: string;
  action?: string;
  setting?: string;
  lighting?: string;
  prompt?: string;
  [key: string]: unknown;
}

export interface Song {
  title?: string;
  artist?: string;
  genre?: string;
  mood?: string;
  key?: string;
  bpm?: number;
  duration_seconds?: number;
  lyrics?: string;
  lyric_lines?: LyricLine[];
  audio_asset?: string;
  source?: string;
  uploaded_at?: string;
  imported_at?: string;
  generation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LyricLine {
  start: number;
  end?: number;
  text: string;
}

export interface BackgroundReferenceAsset {
  id?: string;
  title?: string;
  path?: string;
  generated_at?: string;
  model?: string;
  size?: string;
  [key: string]: unknown;
}

export interface Treatment {
  mode?: string;
  summary?: string;
  concept?: string;
  look?: string;
  realism_target?: string;
  color_palette?: string;
  cinematography?: string;
  orientation?: string;
  aspect_ratio?: string;
  background_prompt?: string;
  background_reference_assets?: BackgroundReferenceAsset[];
  [key: string]: unknown;
}

export interface Task {
  id: string;
  kind?: string;
  target_id?: string;
  status?: string;
  title?: string;
  note?: string;
  [key: string]: unknown;
}

export interface ProjectOption {
  id: string;
  title?: string;
  artist?: string;
  mode?: string;
}

export interface Project {
  project_id: string;
  updated_at?: string;
  projects?: ProjectOption[];
  library?: Record<string, Project>;
  song?: Song;
  treatment?: Treatment;
  characters?: Character[];
  shots?: Shot[];
  tasks?: Task[];
  [key: string]: unknown;
}

export interface ActiveProjectState {
  active_project_id?: string;
  updated_at?: string;
}

export interface LockState {
  locked: boolean;
  owner?: string;
  message?: string;
  started_at?: string;
  [key: string]: unknown;
}

// ---- Config shapes ----

export interface ImageConfig {
  base_url?: string;
  api_key?: string;
  model?: string;
  size?: string;
  [key: string]: unknown;
}

export interface SongConfig {
  draft_backend?: string;
  prod_backend?: string;
  draft_wrapper?: string;
  python?: string;
  [key: string]: unknown;
}

export interface VideoConfig {
  draft_backend?: string;
  draft_wrapper?: string;
  width: number;
  height: number;
  fps: number;
  max_frames: number;
  [key: string]: unknown;
}

// ---- Request query / body shapes ----

export interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

// ---- Provider config / meta ----

// Busabase connection block, as loaded from config.*.json (env overrides win).
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

// config.example.json / config.local.json shape (only the fields the provider
// layer reads; the rest passes through the index signature).
export interface Config {
  data_provider?: string;
  busabase?: BusabaseConfig;
  [key: string]: unknown;
}

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by providers and read by Hono.
// Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
