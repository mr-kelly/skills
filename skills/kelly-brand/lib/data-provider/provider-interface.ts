// The data-provider interface for kelly-brand + its consistency guard.
//
// Every provider (local-file, and future db/cloud backends) implements the same
// `DataProvider` shape, so callers get one from `createProvider()` and use it
// without knowing the backend. `class … implements DataProvider` is checked at
// author time; `assertProvider()` is the runtime guard that makes a
// non-conforming provider fail loudly at registration instead of deep in a
// request with `provider.getX is not a function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat the `.ts` as ESM.

import type { AgentTasksFile, BrandState, DecisionInput, DecisionsFile, OnboardingMarker, Snapshot } from "../types.ts";

/**
 * The polymorphic contract shared by every kelly-brand provider. It mirrors the
 * store surface the Hono server and scripts use: aggregate state, the handoff
 * reads (snapshot / decisions / agent tasks / execution report / onboarding /
 * lock), applying a human verdict, the sanitized config summary, and the two
 * writes scripts perform (onboarding marker + execution report).
 */
export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly name: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate inner payload for `/api/state` (everything under `app`). */
  getState(): Promise<BrandState>;
  /** Apply a human verdict to a narrative item or drift alert. */
  applyDecision(payload: DecisionInput): Promise<DecisionsFile>;
  /** The brand-narrative snapshot. */
  getSnapshot(): Promise<Snapshot>;
  /** All recorded human decisions. */
  getDecisions(): Promise<DecisionsFile>;
  /** Queued agent work (items the agent should revise). */
  getAgentTasks(): Promise<AgentTasksFile>;
  /** Last execution report, or null if none. */
  getExecutionReport(): Promise<unknown>;
  /** Lock status guarding writes. */
  getLock(): Promise<unknown>;
  /** Onboarding marker. */
  getOnboarding(): Promise<OnboardingMarker>;
  /** Sanitized config summary (never secrets), incl. active provider name. */
  getConfigSummary(): Promise<Record<string, unknown>>;
  /** Write the onboarding completion marker. */
  completeOnboarding(marker?: Partial<OnboardingMarker>): Promise<OnboardingMarker>;
  /** Persist an execution report (used by scripts/execute_decisions.ts). */
  writeExecutionReport(report: Record<string, unknown>): Promise<Record<string, unknown>>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "getSnapshot",
  "getDecisions",
  "getAgentTasks",
  "getExecutionReport",
  "getLock",
  "getOnboarding",
  "getConfigSummary",
  "completeOnboarding",
  "writeExecutionReport",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
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
