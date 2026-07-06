// The data-provider contract for kelly-crm + a runtime consistency guard.
//
// kelly-crm's unit of work is a follow-up under review-before-send. Every
// provider (local-file default, Busabase remote) implements this same
// DataProvider shape, so the Hono routes and scripts get one from
// createProvider() and call it without knowing the backend. `assertProvider()`
// is the runtime guard that fails loudly at registration instead of deep in a
// request with `provider.getState is not a function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace/decorators/param-properties), NO build step.

import type { DecisionBody } from "../types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for /api/state (byte-identical to the original store). */
  getState(): Promise<Record<string, unknown>>;
  /** Sanitized config summary + active provider name (never secrets). */
  configSummary(): Promise<Record<string, unknown>>;
  /** Lock status guarding writes (null when unlocked). */
  readLock(): Promise<Record<string, unknown> | null>;
  /** Apply a human verdict to a follow-up; returns the updated decisions file. */
  applyDecision(payload: DecisionBody): Promise<Record<string, unknown>>;

  // reads mirroring the original store surface (hono + scripts) ───────────────
  readSnapshot(): Promise<Record<string, unknown>>;
  readDecisions(): Promise<Record<string, unknown>>;
  readAgentTasks(): Promise<Record<string, unknown>>;
  readExecutionReport(): Promise<Record<string, unknown> | null>;
  readOnboarding(): Promise<Record<string, unknown>>;

  // writes used by the scripts ────────────────────────────────────────────────
  /** Persist a CRM snapshot (generate_demo_snapshot). */
  writeSnapshot(snapshot: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Persist the execution report (execute_decisions --apply). */
  writeExecutionReport(report: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "configSummary",
  "readLock",
  "applyDecision",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "writeSnapshot",
  "writeExecutionReport",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to DataProvider; throw one actionable error listing
 * everything missing. Call at registration (in createProvider()) — the runtime
 * backstop to the compile-time contract.
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
