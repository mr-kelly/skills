// The data-provider contract for kelly-family-fund.
//
// kelly-family-fund is a READ-MOSTLY bookkeeping dashboard: it reads a fund
// snapshot (elders' pooled pensions, expenses, per-family fairness rollups) and
// renders it. It never moves money. The only writes are the agent-side handoff:
// the CSV importer / demo generator persist a freshly built snapshot (and an
// import report), and onboarding records a completion marker.
//
// Every provider (local-file default, Busabase, and any future backend)
// implements this same FundProvider shape, so hono.ts and the scripts get one
// from createProvider() and use it without knowing the backend. The `implements`
// check is compile-time; assertProvider() is the runtime guard that makes a
// non-conforming provider fail loudly at registration instead of deep inside a
// request with `provider.getState is not a function`.
//
// Erasable-only TypeScript (Node >=23.6 native type-stripping): interfaces and
// string-literal unions only — no enum/namespace, no build step.

import type { ConfigResult, ConfigSummary, FundSnapshot } from "../types.ts";

/** Aggregate payload backing GET /api/state (before demo/insight decoration). */
export interface FundState {
  data_provider: string;
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: ConfigSummary;
  snapshot: FundSnapshot;
}

export interface FundProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in /api/state as data_provider. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate read for GET /api/state (snapshot + onboarding + lock + config). */
  getState(): Promise<FundState>;
  /** The current fund snapshot (empty snapshot if none persisted yet). */
  getSnapshot(): Promise<FundSnapshot>;
  /** Persist a freshly built snapshot (CSV import / demo generation). */
  putSnapshot(snapshot: FundSnapshot): Promise<{ ok: true; snapshot_id: string }>;
  /** Loaded config + its source path (drives fund meta, beneficiaries, families). */
  getConfig(): Promise<ConfigResult>;
  /** Sanitized config summary for the dashboard (never secrets). */
  getConfigSummary(): Promise<ConfigSummary>;
  /** Onboarding completion marker. */
  getOnboarding(): Promise<Record<string, unknown>>;
  /** Lock status guarding writes while the agent is generating a snapshot. */
  getLock(): Promise<Record<string, unknown> | null>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Persist the import report emitted by the CSV importer (local handoff). */
  putImportReport?(report: Record<string, unknown>): Promise<{ ok: true }>;
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "getSnapshot",
  "putSnapshot",
  "getConfig",
  "getConfigSummary",
  "getOnboarding",
  "getLock",
] as const satisfies readonly (keyof FundProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = [
  "putImportReport",
  "verifyConnection",
] as const satisfies readonly (keyof FundProvider)[];

/**
 * Assert `provider` conforms to {@link FundProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
 * runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(kind: string, provider: unknown): FundProvider {
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
    throw new Error(`Data provider "${kind}" does not satisfy FundProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as FundProvider;
}
