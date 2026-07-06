// The data-provider contract for kelly-ads + a runtime consistency guard.
//
// kelly-ads' unit of work is an ads snapshot under review-before-execute: the
// agent ingests platform performance into app/.data/ads_snapshot.json, checks
// draft skeleton adjustment cards, and a human approves / blocks each card in
// the UI before the agent executes it via platform APIs. That review model maps
// cleanly onto Busabase's record + change_request + review + merge, so the same
// UI and scripts run against either backend through this one interface:
//
//   KELLY_ADS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_ADS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace/decorators), NO build step. `implements DataProvider` is the
// author-time check; assertProvider() is the runtime backstop that fails loudly
// at registration instead of deep in a request with "provider.x is not a function".

import type {
  Adjustment,
  AdjustmentDecision,
  AdsSnapshot,
  Config,
  ConfigResult,
  ConfigSummary,
  DecisionInput,
  DecisionsFile,
  Lock,
  Onboarding,
} from "../types.ts";

// The state payload the Hono server returns from /api/state (non-demo).
export interface AdsState {
  app: string;
  data_provider: string;
  onboarding: Onboarding;
  lock: Lock | null;
  config_summary: ConfigSummary;
  snapshot: AdsSnapshot;
  [key: string]: unknown;
}

// The polymorphic contract shared by every provider. It mirrors the store
// surface the Hono server and scripts (ingest / checks / execute) rely on:
// snapshot + decisions I/O, the agent lock, config access, and the review verb
// applyDecision. Config helpers (readConfig/summarizeConfig) are provider-neutral
// but live on the provider so callers get one object with everything they need.
export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state.data_provider. */
  readonly name: string;

  // ── read state ──────────────────────────────────────────────────────────────
  /** Aggregate payload for /api/state (non-demo). */
  getState(): Promise<AdsState>;
  /** The normalized ads snapshot (or an empty snapshot when none exists). */
  readSnapshot(): Promise<AdsSnapshot>;
  /** Persisted human verdicts keyed by adjustment_id. */
  readDecisions(): Promise<DecisionsFile>;
  /** Onboarding completion marker. */
  readOnboarding(): Promise<Onboarding>;

  // ── write state ─────────────────────────────────────────────────────────────
  /** Persist a full snapshot (used by the ingest / checks / execute scripts). */
  writeSnapshot(snapshot: AdsSnapshot): Promise<void>;
  /** Apply a human verdict to one adjustment card and sync the agent queue. */
  applyDecision(input: DecisionInput): Promise<{ adjustment: Adjustment; decision: AdjustmentDecision }>;

  // ── lock (guards writes while the agent works) ───────────────────────────────
  /** Current agent lock, or null when unlocked. */
  readLock(): Promise<Lock | null>;
  /** Acquire the agent lock; throws (code "LOCKED") when another owner holds it. */
  acquireLock(owner: string, message: string): Promise<void>;
  /** Release the agent lock. */
  releaseLock(): Promise<void>;

  // ── config ──────────────────────────────────────────────────────────────────
  /** Loaded private config (or the example fallback). */
  readConfig(): Promise<ConfigResult>;
  /** Sanitized config summary for the UI (never secrets). */
  summarizeConfig(configResult: ConfigResult): ConfigSummary;

  // ── setup ─────────────────────────────────────────────────────────────────────
  /** Ensure the storage location exists (a no-op for remote providers). */
  ensureDirs(): Promise<void>;

  // ── optional extensions (provider-specific) ──────────────────────────────────
  /** Probe connectivity (remote providers only). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

// Config helpers the scripts still call directly; providers hold no state for
// them, so index.ts re-exports the shared implementation. Kept here as a type
// hint of the extra provider-neutral surface.
export interface ConfigHelpers {
  loadDotenvFiles(files: string[]): Promise<void>;
  envSearchPaths(): string[];
  readConfig(): Promise<ConfigResult>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "readSnapshot",
  "readDecisions",
  "readOnboarding",
  "writeSnapshot",
  "applyDecision",
  "readLock",
  "acquireLock",
  "releaseLock",
  "readConfig",
  "summarizeConfig",
  "ensureDirs",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Called at registration (in createProvider()) — the
 * runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(name: string, provider: unknown): DataProvider {
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
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}

export type { Config, ConfigResult, ConfigSummary };
