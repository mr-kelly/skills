// The data-provider contract for kelly-pr-review.
//
// kelly-pr-review is an App-in-Skill whose unit of work — a GitHub pull request
// moving through a local review queue (needs_review -> to_approve -> approved ->
// done / blocked) plus a merged-PR human-test verification (needs_test ->
// tested) — maps cleanly onto Busabase's review model (record + change_request
// + operation + commit + review + merge). This interface lets the same UI and
// scripts run against either backend:
//
//   KELLY_PR_REVIEW_DATA_PROVIDER=local     (default) JSON files in app/.cache/
//   KELLY_PR_REVIEW_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Every provider (local-file, busabase, future db/cloud backends) implements
// this same `ReviewProvider` shape, so `createProvider()` hands one back and the
// server/scripts use it without knowing the backend. `assertProvider()` is the
// runtime guard that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with `provider.getState is not a
// function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type { DecisionBody, SetTestedOptions, StateQuery, TestedCacheEntry } from "../types.ts";

// The state / decision / tested actions the UI performs, plus the batch,
// decisions, and execution-report IO the scripts need. Local mode reads and
// writes app/.cache/*.json; busabase mode maps the same surface onto a base.
export interface ReviewProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── read (UI + scripts) ─────────────────────────────────────────────────
  /** Aggregate payload for `GET /api/state` (filtered by query). */
  getState(query?: StateQuery): Promise<Record<string, unknown>>;
  /** Lock status for `GET /api/lock` and write guards. */
  getLock(): Promise<Record<string, unknown>>;
  /** Sanitized config summary embedded in `getState()` (never secrets). */
  configSummary(): Promise<Record<string, unknown>> | Record<string, unknown>;

  // ── write (UI) ──────────────────────────────────────────────────────────
  /** Apply a bulk review verdict (approve/comment/request_changes/block/…). */
  saveDecision(body: DecisionBody & Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Save an in-place edit to one item's review note / comment. */
  saveDetail(body: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Record / clear human test verification for a merged PR. */
  setTested(
    id: string,
    tested: boolean,
    options?: SetTestedOptions,
  ): Promise<TestedCacheEntry | Record<string, unknown>>;

  // ── batch / handoff IO (scripts) ────────────────────────────────────────
  // These return the loosely-typed JSON handoff shapes the batch scripts read
  // and write (ReviewBatch / decisions file / execution report). Typed as `any`
  // to match the project's non-strict, JSON-in/JSON-out script style.
  /** Load the current normalized batch (empty batch if none). */
  loadBatch(): Promise<any>;
  /** Persist the current batch (and its per-id snapshot). */
  saveBatch(batch: any): Promise<void>;
  /** Recompute + persist the decisions handoff file from a batch. */
  writeDecisions(batch: any): Promise<any>;
  /** Read the decisions handoff file (execute_decisions.ts). */
  readDecisions(fallback?: unknown): Promise<any>;
  /** Read the execution report (state payload + execute_decisions.ts). */
  readExecutionReport(fallback?: unknown): Promise<any>;
  /** Write the execution report (execute_decisions.ts). */
  writeExecutionReport(report: Record<string, unknown>): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "getLock",
  "configSummary",
  "saveDecision",
  "saveDetail",
  "setTested",
  "loadBatch",
  "saveBatch",
  "writeDecisions",
  "readDecisions",
  "readExecutionReport",
  "writeExecutionReport",
] as const satisfies readonly (keyof ReviewProvider)[];

/**
 * Assert `provider` conforms to {@link ReviewProvider}; throw one actionable
 * error listing everything missing. Called at registration (in createProvider())
 * — the runtime backstop to the compile-time `implements`-style check.
 */
export function assertProvider(name: string, provider: unknown): ReviewProvider {
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
      `Data provider "${name}" does not satisfy ReviewProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as ReviewProvider;
}
