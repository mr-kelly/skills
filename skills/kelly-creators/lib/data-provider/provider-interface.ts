// The data-provider interface + consistency guard for kelly-creators.
//
// kelly-creators is an App-in-Skill whose unit of work — a creator engagement
// under review-before-outreach — maps onto Busabase's review model
// (record + change_request + operation + review + merge). Every provider
// (local-file, and the Busabase mapping) implements the same `DataProvider`
// shape, so the Hono server and scripts get one from `createProvider()` and use
// it without knowing the backend.
//
// `assertProvider()` is the runtime guard that makes a non-conforming provider
// fail loudly at registration instead of deep in a request with
// `provider.getX is not a function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat the `.ts` as ESM.

import type { DecisionBody, ExecuteOptions } from "../types.ts";

/**
 * The polymorphic contract shared by every kelly-creators provider. Members
 * mirror the original store.ts surface: reads for `/api/state`, the review
 * verdict, the config summary, plus the snapshot write and executor the scripts
 * drive.
 */
export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state` as data_provider. */
  readonly kind: string;

  // ── aggregate state ─────────────────────────────────────────────────────────
  /** Full payload for `/api/state` (onboarding, lock, config_summary, decisions, agent_tasks, execution_report, snapshot). */
  getState(): Promise<Record<string, unknown>>;

  // ── individual reads (used by getState and by scripts) ──────────────────────
  readSnapshot(): Promise<Record<string, unknown>>;
  readDecisions(): Promise<Record<string, unknown>>;
  readAgentTasks(): Promise<Record<string, unknown>>;
  readExecutionReport(): Promise<Record<string, unknown> | null>;
  readOnboarding(): Promise<Record<string, unknown>>;
  readLock(): Promise<Record<string, unknown> | null>;

  // ── writes / actions ────────────────────────────────────────────────────────
  /** Apply a human verdict (approve | request_changes | block | revise) to one creator. */
  applyDecision(payload: DecisionBody): Promise<Record<string, unknown>>;
  /** Persist an agent-prepared creator snapshot. */
  writeSnapshot(snapshot: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Dry-run-by-default executor: hand approved engagements to delegated skills. */
  executeDecisions(options?: ExecuteOptions): Promise<Record<string, unknown>>;

  // ── config ──────────────────────────────────────────────────────────────────
  /** Sanitized config summary for the UI (never secrets). */
  configSummary(): Record<string, unknown>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "readLock",
  "applyDecision",
  "writeSnapshot",
  "executeDecisions",
  "configSummary",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
 * runtime backstop to the compile-time interface check.
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
  if (problems.length) {
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
