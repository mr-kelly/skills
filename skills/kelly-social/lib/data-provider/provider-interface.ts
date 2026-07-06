// The data-provider interface for kelly-social + its runtime consistency guard.
//
// kelly-social is a read-mostly social monitoring dashboard: the UI reads a
// normalized snapshot (timelines, follower trends, per-account stats, a sync
// log) plus the setup summary, onboarding marker, and write-lock. The agent
// writes the snapshot out of band (scripts/ingest_snapshot.ts), so the provider
// surface is deliberately read-heavy — there is no per-item "decision" write
// like review-oriented App-in-Skills have.
//
// Every provider (local-file default, Busabase remote) implements this same
// `DataProvider` shape so the Hono server and scripts get one from
// createProvider() and use it without knowing the backend. `assertProvider()`
// is the runtime guard that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with "provider.getX is not a
// function".
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}`
// makes Node treat the `.ts` files as ESM.

import type { ConfigSummary, Lock, Onboarding, SocialSnapshot, SocialState } from "../types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state` as data_provider. */
  readonly kind: string;

  // ── core (required) ─────────────────────────────────────────────────────────
  /** Aggregate payload for `/api/state` (snapshot + onboarding + lock + summary). */
  getState(): Promise<SocialState>;
  /** The normalized social snapshot (accounts, posts, sync log, warnings). */
  getSnapshot(): Promise<SocialSnapshot>;
  /** Onboarding completion marker. */
  getOnboarding(): Promise<Onboarding>;
  /** Write-lock status guarding snapshot writes (null when unlocked). */
  getLock(): Promise<Lock | null>;
  /** Sanitized setup summary (handles, platforms, env readiness — never secrets). */
  getConfigSummary(): Promise<ConfigSummary>;

  // ── optional extensions (provider-specific) ─────────────────────────────────
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "getSnapshot",
  "getOnboarding",
  "getLock",
  "getConfigSummary",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
 * runtime backstop to the compile-time contract.
 */
export function assertProvider(kind: string, provider: unknown): DataProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${kind}" is not an object.`);
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
    throw new Error(`Data provider "${kind}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
