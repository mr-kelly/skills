// The data-provider contract for kelly-drama + a runtime consistency guard.
//
// kelly-drama is a workspace-style media studio, NOT a review queue. Its store
// surface is: one project document (characters / relationships / episodes /
// storyboard shots / tasks), a handful of named config blobs (image / video /
// tts), an active-project pointer, a write lock, and generated media files
// (storyboard images, reference cards, videos, voices).
//
// Every provider (local-file default, busabase, and any future backend)
// implements this same `DramaProvider` shape, so the server and scripts get one
// from `createProvider()` and use it without knowing the backend.
// `assertProvider()` is the runtime guard that makes a non-conforming provider
// fail loudly at registration instead of deep in a request.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat these `.ts` files as ESM.

import type { ActiveProjectState, ConfigBlob, LockState, Project } from "../types.ts";

// Named config blobs the studio persists under .data/*.json. Kept as an open
// string type so a provider can carry additional blobs, but these three are the
// ones the services read.
export type ConfigName = "image" | "video" | "tts";

export interface DramaProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── project document ───────────────────────────────────────────────────────
  /** Ensure the project document exists (seed from the starter on first run). */
  ensureProject(): Promise<void>;
  /** Load the normalized project document. */
  loadProject(): Promise<Project>;
  /** Persist (and normalize) the project document; returns the stored value. */
  saveProject(project: unknown): Promise<Project>;

  // ── active-project pointer ─────────────────────────────────────────────────
  /** Read the active-project pointer (`{}` when unset). */
  loadActiveProject(): Promise<ActiveProjectState>;
  /** Persist the active-project pointer. */
  saveActiveProject(state: ActiveProjectState): Promise<ActiveProjectState>;

  // ── named config blobs (image / video / tts) ──────────────────────────────
  /** Read a stored config blob (`{}` when absent). */
  loadConfigBlob(name: ConfigName): Promise<ConfigBlob>;
  /** Persist a config blob verbatim. */
  saveConfigBlob(name: ConfigName, value: ConfigBlob): Promise<ConfigBlob>;

  // ── write lock ─────────────────────────────────────────────────────────────
  /** Lock status for the UI (`{ locked }` plus any lock metadata). */
  getLock(): Promise<LockState>;
  /** Throw a 423-ish error when the project files are locked by the agent. */
  assertUnlocked(): Promise<void>;

  // ── generated media (binary assets) ────────────────────────────────────────
  // Public paths are the `/generated/...` URLs stored on shots/characters. The
  // provider maps them onto storage; the local provider keeps them on disk under
  // .data/generated and this stays Node-only behind the provider seam.
  /** Read a generated asset by its `/generated/...` public path. */
  readGeneratedAsset(publicPath: string): Promise<Buffer>;
  /** Write bytes for a `/generated/...` public path, creating parents. */
  writeGeneratedAsset(publicPath: string, bytes: Buffer): Promise<void>;
  /** Whether a generated asset exists at the given public path. */
  generatedAssetExists(publicPath: string): Promise<boolean>;

  /** Sanitized provider info for the UI/summary (never secrets). */
  configSummary(): Record<string, unknown>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "ensureProject",
  "loadProject",
  "saveProject",
  "loadActiveProject",
  "saveActiveProject",
  "loadConfigBlob",
  "saveConfigBlob",
  "getLock",
  "assertUnlocked",
  "readGeneratedAsset",
  "writeGeneratedAsset",
  "generatedAssetExists",
  "configSummary",
] as const satisfies readonly (keyof DramaProvider)[];

/**
 * Assert `provider` conforms to {@link DramaProvider}; throw one actionable error
 * listing everything missing. Called at registration in createProvider() — the
 * runtime backstop that fails loud instead of `provider.loadProject is not a
 * function` deep in a request.
 */
export function assertProvider(name: string, provider: unknown): DramaProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${name}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${name}" does not satisfy DramaProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as DramaProvider;
}
