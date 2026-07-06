// The data-provider contract for kelly-family-office + its runtime guard.
//
// kelly-family-office is a READ-MOSTLY consolidation dashboard: the agent (or an
// import script) writes one authoritative snapshot, and the UI reads it back
// with config, onboarding, and lock context. There is no review queue — so this
// interface mirrors that store surface, not a change-request model:
//
//   getState()          -> { onboarding, lock, config_summary, snapshot }  (for /api/state)
//   readSnapshot()      -> the consolidated portfolio snapshot
//   writeSnapshot(s)    -> persist a snapshot (used by the import/demo scripts)
//   readConfig()        -> the loaded config + its source path
//   summarizeConfig(r)  -> sanitized config for the UI (never secrets)
//   readOnboarding()    -> onboarding completion marker
//   readLock()          -> write-lock status (null when unlocked)
//   configSummary()     -> sanitized provider info echoed in /api/state
//
// Every provider (local-file default, Busabase remote) implements this same
// shape, so the Hono server and scripts get one from createProvider() and use it
// without knowing the backend. `assertProvider()` is the runtime backstop that
// makes a non-conforming provider fail loudly at registration instead of deep in
// a request with `provider.getX is not a function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step.

import type { ConfigResult, ConfigSummary, ConsolidatedSnapshot, FamilyOfficeState } from "../types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate read-mostly payload for GET /api/state. */
  getState(): Promise<FamilyOfficeState>;
  /** The consolidated portfolio snapshot. */
  readSnapshot(): Promise<ConsolidatedSnapshot>;
  /** Persist a snapshot (import_csv / generate_demo_snapshot scripts). */
  writeSnapshot(snapshot: ConsolidatedSnapshot): Promise<{ ok: boolean; path?: string | null }>;
  /** The loaded config plus its source path and example flag. */
  readConfig(): Promise<ConfigResult>;
  /** Sanitized config summary for the UI (never secrets). */
  summarizeConfig(configResult: ConfigResult): ConfigSummary;
  /** Onboarding completion marker. */
  readOnboarding(): Promise<Record<string, unknown>>;
  /** Write-lock status guarding writes (null when unlocked). */
  readLock(): Promise<Record<string, unknown> | null>;
  /** Sanitized provider info echoed in /api/state (never secrets). */
  configSummary(): Record<string, unknown>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "readSnapshot",
  "writeSnapshot",
  "readConfig",
  "summarizeConfig",
  "readOnboarding",
  "readLock",
  "configSummary",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
 * runtime backstop to the compile-time `implements`/shape check.
 */
export function assertProvider(name: string, provider: unknown): DataProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${name}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
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
