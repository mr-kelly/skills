// The data-provider interface + consistency guard for kelly-audit.
//
// kelly-audit's unit of work — an audit anomaly moving through review-before-
// execute — is the same review model kelly-writer and Busabase share. Every
// provider (local-file default, Busabase remote, future backends) implements
// this one shape, so hono.ts and scripts/*.ts get a provider from
// createProvider() and use it without knowing the backend.
//
// `class … implements DataProvider` is the author-time check; assertProvider()
// is the runtime guard that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with "provider.getState is not a
// function".
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type {
  AgentTasksFile,
  ApplyDecisionInput,
  ApplyDecisionResult,
  AuditSnapshot,
  DecisionsFile,
  ExecutionReport,
  LockRecord,
  Onboarding,
} from "../types.ts";

/**
 * The polymorphic contract shared by every kelly-audit provider. Mirrors the
 * read/write surface the original app/server/store.ts exposed to hono.ts and the
 * scripts, so a backend switch is a config flip, not a rewrite of the UI or the
 * import/checks/execute pipeline.
 */
export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly name: string;

  // ── reads (required) ───────────────────────────────────────────────────────
  /** The current audit snapshot (orders/invoices/payments/anomalies/metrics). */
  readSnapshot(): Promise<AuditSnapshot>;
  /** Onboarding completion marker. */
  readOnboarding(): Promise<Onboarding>;
  /** Lock record guarding writes, or null when unlocked. */
  readLock(): Promise<LockRecord | null>;
  /** Saved human verdicts keyed by anomaly id. */
  readDecisions(): Promise<DecisionsFile>;
  /** Queued agent revision tasks. */
  readAgentTasks(): Promise<AgentTasksFile>;
  /** Latest execution report, or null. */
  readExecutionReport(): Promise<ExecutionReport | null>;

  // ── writes (required) ──────────────────────────────────────────────────────
  /** Ensure backing storage exists (dirs for local, no-op for remote). */
  ensureReady(): Promise<void>;
  /** Apply a human verdict to one anomaly and sync the agent-task queue. */
  applyDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult>;
  /** Persist the full audit snapshot (import/checks write path). */
  writeSnapshot(snapshot: AuditSnapshot): Promise<void>;
  /** Persist the execution report (execute write path). */
  writeExecutionReport(report: ExecutionReport): Promise<void>;
  /** Acquire the write lock; throws if already held. */
  acquireLock(record: LockRecord): Promise<void>;
  /** Release the write lock (idempotent). */
  releaseLock(): Promise<void>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "readSnapshot",
  "readOnboarding",
  "readLock",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "ensureReady",
  "applyDecision",
  "writeSnapshot",
  "writeExecutionReport",
  "acquireLock",
  "releaseLock",
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
