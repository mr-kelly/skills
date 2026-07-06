// The data-provider contract for kelly-mv.
//
// kelly-mv is a music-video workspace: a single project.json (song, treatment,
// characters, shots, tasks) plus per-workspace config (image/song/video), an
// active-project pointer, an agent write-lock, and generated/uploaded media
// (images, audio, video) stored under app/.data/generated/.
//
// Every backend (local files today, Busabase / a cloud store tomorrow)
// implements this same `MvDataProvider` shape, so the Hono app and the scripts
// get one from `createProvider()` and use it without knowing the backend. The
// compile-time `implements`/return-type check is the author-time guard;
// `assertProvider()` is the runtime backstop that makes a non-conforming
// provider fail loudly at registration instead of deep inside a request with
// `provider.loadProject is not a function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat these `.ts` files as ESM.

import type { ActiveProjectState, ImageConfig, LockState, Project, SongConfig, VideoConfig } from "../types.ts";

/** A generated/uploaded media file to persist under app/.data/generated/. */
export interface GeneratedWrite {
  /** Subdirectory under generated/, e.g. "storyboards" | "references" | "songs" | "videos". */
  subdir: string;
  /** Basename to write, e.g. "shot-001-1720000000.png". */
  filename: string;
  /** File bytes. */
  bytes: Uint8Array;
}

/** Result of persisting a generated/uploaded media file. */
export interface GeneratedResult {
  /** Public URL path served by the app, e.g. "/generated/storyboards/foo.png". */
  publicPath: string;
  /** Absolute on-disk path (Node-only; null for remote providers). */
  absPath: string | null;
}

/**
 * The polymorphic contract shared by every kelly-mv provider. Core members are
 * required; the trailing optionals are provider-specific extensions.
 */
export interface MvDataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state` config summary. */
  readonly name: string;

  // ── project store (required) ───────────────────────────────────────────────
  /** Create the project store from the starter template if it does not exist. */
  ensureProject(): Promise<void>;
  /** Load the normalized project snapshot (song, treatment, characters, shots, tasks). */
  loadProject(): Promise<Project>;
  /** Persist a project snapshot (stamps updated_at); returns the normalized value. */
  saveProject(project: Project): Promise<Project>;

  // ── active project (required) ──────────────────────────────────────────────
  /** The active-project pointer (which workspace in the library is in view). */
  getActiveProjectState(): Promise<ActiveProjectState>;
  /** Set the active-project pointer. */
  setActiveProjectState(state: ActiveProjectState): Promise<ActiveProjectState>;

  // ── config (required) ──────────────────────────────────────────────────────
  /** Persisted image-generation config (base_url, api_key, model, size). */
  readImageConfig(): Promise<ImageConfig>;
  /** Persist the image-generation config. */
  writeImageConfig(config: ImageConfig): Promise<void>;
  /** Persisted song-generation config overrides (may be empty). */
  readSongConfig(): Promise<SongConfig>;
  /** Persisted video-generation config overrides (may be empty). */
  readVideoConfig(): Promise<Partial<VideoConfig>>;

  // ── lock (required) ────────────────────────────────────────────────────────
  /** Current write-lock state ({ locked: false } when free). */
  getLock(): Promise<LockState>;
  /** Throw if the store is locked by the agent (guards writes). */
  assertUnlocked(): Promise<void>;

  // ── generated media (required) ─────────────────────────────────────────────
  /** Persist generated/uploaded media bytes; returns its public + absolute path. */
  writeGenerated(write: GeneratedWrite): Promise<GeneratedResult>;
  /** Read a generated media file by its `/generated/...` public path (for serving). */
  readGenerated(publicPath: string): Promise<Uint8Array | null>;
  /** Read raw bytes of a generated file by public path, or null if missing (for API references). */
  readGeneratedBytes(publicPath: string): Promise<Uint8Array | null>;
  /** True if a generated file exists for the given public path. */
  generatedExists(publicPath: string): Promise<boolean>;
  /** Absolute on-disk path for a generated public path (Node-only; null for remote). */
  resolveGeneratedAbsPath(publicPath: string): string | null;
  /**
   * Ensure a generated subdir exists on disk and return its absolute path
   * (Node-only; null for remote providers). Used before a child-process wrapper
   * writes media directly (local video draft generation).
   */
  ensureGeneratedDir(subdir: string): Promise<string | null>;

  // ── config summary (required) ──────────────────────────────────────────────
  /** Sanitized provider info for the UI (never secrets). */
  configSummary(): Record<string, unknown>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Copy an external file into generated media (local import path). */
  copyIntoGenerated?(sourceAbsPath: string, subdir: string, filename: string): Promise<GeneratedResult>;
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "ensureProject",
  "loadProject",
  "saveProject",
  "getActiveProjectState",
  "setActiveProjectState",
  "readImageConfig",
  "writeImageConfig",
  "readSongConfig",
  "readVideoConfig",
  "getLock",
  "assertUnlocked",
  "writeGenerated",
  "readGenerated",
  "readGeneratedBytes",
  "generatedExists",
  "resolveGeneratedAbsPath",
  "ensureGeneratedDir",
  "configSummary",
] as const satisfies readonly (keyof MvDataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = [
  "copyIntoGenerated",
  "verifyConnection",
] as const satisfies readonly (keyof MvDataProvider)[];

/**
 * Assert `provider` conforms to {@link MvDataProvider}; throw one actionable
 * error listing everything missing. Called at registration in createProvider()
 * — the runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(name: string, provider: unknown): MvDataProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${name}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.name !== "string" || !candidate.name) problems.push("name (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  for (const method of OPTIONAL_METHODS) {
    if (method in candidate && typeof candidate[method] !== "function") {
      problems.push(`${method}() [optional, must be a function if present]`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${name}" does not satisfy MvDataProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as MvDataProvider;
}
