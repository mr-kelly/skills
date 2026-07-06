// The data-provider contract for kelly-seo + a runtime consistency guard.
//
// kelly-seo is an App-in-Skill whose unit of work is a GSC analytics snapshot
// plus an SEO-opportunity approval queue. Every backend (local JSON files, and a
// remote Busabase base) implements this same SeoDataProvider surface, so the Hono
// server and the batch scripts get one from createProvider() and never branch on
// the backend. `implements SeoDataProvider` is the author-time check; the
// assertProvider() guard below is the runtime backstop that makes a
// non-conforming provider fail loudly at registration instead of deep inside a
// request with "provider.getState is not a function".
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json's {"type":"module"} makes
// Node treat these .ts files as ESM.

import type { DecisionInput, DecisionResult, DecisionsFile, SeoSnapshot } from "../types.ts";

/**
 * The polymorphic contract shared by every kelly-seo provider. Members mirror the
 * former app/server/store.ts surface: the aggregate /api/state read, the human
 * verdict write, the individual state reads/writes the scripts rely on, and the
 * agent-lock guard around them.
 */
export interface SeoDataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── aggregate + review (used by the Hono server) ───────────────────────────
  /** Aggregate payload for `/api/state` (snapshot + decisions + lock + ...). */
  getState(): Promise<Record<string, unknown>>;
  /** Apply a human verdict / edit to one opportunity. */
  saveDecision(payload: DecisionInput): Promise<DecisionResult>;
  /** Sanitized config summary (never secrets). */
  configSummary(): Promise<Record<string, unknown>>;

  // ── individual reads (used by the batch scripts) ───────────────────────────
  /** The GSC snapshot, or an empty snapshot when none exists. */
  getSnapshot(): Promise<SeoSnapshot>;
  /** Stored decision map. */
  getDecisions(): Promise<DecisionsFile>;
  /** Latest execution report, or null. */
  getExecutionReport(): Promise<Record<string, unknown> | null>;
  /** Current agent-lock record, or null. */
  getLock(): Promise<Record<string, unknown> | null>;
  /** Queued agent tasks (opportunities in `changes_requested`). */
  getAgentTasks(): Promise<Record<string, unknown>>;
  /** Onboarding completion marker. */
  getOnboarding(): Promise<Record<string, unknown>>;

  // ── writes + lock (used by sync / execute scripts) ─────────────────────────
  /** Persist a freshly synced GSC snapshot. */
  writeSnapshot(snapshot: SeoSnapshot): Promise<void>;
  /** Persist an execution report. */
  writeExecutionReport(report: Record<string, unknown>): Promise<void>;
  /** Take the agent lock (throws if one is already held elsewhere). */
  acquireLock(message: string): Promise<Record<string, unknown>>;
  /** Release the agent lock. */
  releaseLock(): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "saveDecision",
  "configSummary",
  "getSnapshot",
  "getDecisions",
  "getExecutionReport",
  "getLock",
  "getAgentTasks",
  "getOnboarding",
  "writeSnapshot",
  "writeExecutionReport",
  "acquireLock",
  "releaseLock",
] as const satisfies readonly (keyof SeoDataProvider)[];

/**
 * Assert `provider` conforms to {@link SeoDataProvider}; throw one actionable
 * error listing everything missing. Call at registration (in createProvider) —
 * the runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(kind: string, provider: unknown): SeoDataProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${kind}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${kind}" does not satisfy SeoDataProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as SeoDataProvider;
}
