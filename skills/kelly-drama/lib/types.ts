// Shared types for the kelly-drama data-provider layer. These model the ACTUAL
// shapes flowing through the provider and the server — a workspace-style media
// studio (a project document holding characters / relationships / episodes /
// storyboard shots / tasks, plus named config blobs and generated media).

// The project document persisted at .data/project.json. Kept intentionally
// loose: the services read many open-ended optional keys off characters /
// shots / episodes, so the collections are typed permissively (matching the
// original untyped store, which inferred `any`-shaped items) while the
// top-level collection names stay stable.
type Loose = any;

export interface Project {
  project_id: string;
  updated_at: string;
  projects: Loose[];
  library: Record<string, Loose>;
  series: Loose;
  characters: Loose[];
  relationships: Loose[];
  episodes: Loose[];
  shots: Loose[];
  tasks: Loose[];
  [key: string]: Loose;
}

// Persisted .data/active_project.json shape.
export interface ActiveProjectState {
  active_project_id?: string;
  updated_at?: string;
}

// Lock status guarding writes (from .data/agent.lock).
export interface LockState {
  locked: boolean;
  [key: string]: unknown;
}

// A stored config blob (image_config.json / video_config.json / tts_config.json).
// The provider persists and returns these verbatim; the services layer the
// defaults and masking on top.
export type ConfigBlob = Record<string, unknown>;

// Config as loaded from config.local.json / config.example.json / env.
export interface BusabaseConfig {
  base_url?: string;
  base_id?: string;
  api_key_env?: string;
}

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

// Error carrying an HTTP status code, thrown by the providers/services and read
// by the Hono server. Matches the runtime shape `new Error(...)` + `.statusCode`.
export interface HttpError extends Error {
  statusCode?: number;
}
