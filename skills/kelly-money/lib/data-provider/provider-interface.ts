// The data-provider interface + runtime consistency guard for kelly-money.
//
// kelly-money is a read-mostly financial DASHBOARD: the UI polls one aggregate
// endpoint (GET /api/state) and never writes back. So the provider surface
// mirrors the ORIGINAL app/server/store.ts reads — a getState() aggregate plus
// its constituent parts (snapshot / onboarding / lock / config summary) — rather
// than a review-queue shape kelly-money does not have.
//
// Every provider (local-file, busabase, future cloud backends) implements the
// same DataProvider shape, so the Hono server and scripts get one from
// createProvider() and use it without knowing the backend. `implements
// DataProvider` is the author-time check; assertProvider() is the runtime guard
// that makes a non-conforming provider fail loudly at registration instead of
// deep in a request with `provider.getState is not a function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type { AppState, ConfigSummary, LedgerSnapshot, Onboarding } from "../types.ts";

/**
 * The polymorphic contract shared by every kelly-money provider. Core members
 * are required; providers may add backend-specific extensions.
 */
export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state` as data_provider. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for `GET /api/state`. */
  getState(): Promise<AppState>;
  /** Normalized ledger snapshot (accounts / transactions / invoices / matches). */
  getSnapshot(): Promise<LedgerSnapshot>;
  /** Onboarding completion marker. */
  getOnboarding(): Promise<Onboarding>;
  /** Lock status guarding the data files while the agent is writing. */
  getLock(): Promise<unknown>;
  /** Sanitized config summary for the UI (never raw secrets). */
  getConfigSummary(): Promise<ConfigSummary>;

  // ── optional extensions (provider-specific) ────────────────────────────────
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
 * listing everything missing. Called at registration in createProvider() — the
 * runtime backstop to the compile-time `implements` check.
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
