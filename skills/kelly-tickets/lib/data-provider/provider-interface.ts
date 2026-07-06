// The data-provider contract for kelly-tickets — the complaint desk store
// surface (intake -> classify -> dispatch -> resolution board) expressed as one
// polymorphic interface. Every backend (the local-file default, and the
// Busabase HTTP client) implements the same `TicketsProvider`, so the Hono
// server and the scripts get a provider from `createProvider()` and call it
// without knowing where the JSON lives.
//
// `class … implements TicketsProvider` is checked at author time; the runtime
// `assertProvider()` guard makes a non-conforming provider fail loudly at
// registration instead of deep in a request with "provider.readSnapshot is not
// a function". Runs on Node >=23.6 via native type-stripping — erasable
// TypeScript only (no enum/namespace), no build step.

import type {
  AgentTasks,
  ConfigResult,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  Snapshot,
  TicketsState,
} from "../types.ts";

export interface TicketsProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── aggregate + review (the server's hot path) ──────────────────────────────
  /** Full payload behind GET /api/state (non-demo), decisions already merged. */
  getState(): Promise<TicketsState>;
  /** Apply a human verdict to one board item (intake / ticket / dispatch proposal). */
  submitDecision(input: DecisionInput): Promise<DecisionResult>;
  /** Sanitized config summary for the UI (never raw secrets). */
  configSummary(): ConfigSummary;

  // ── granular store I/O (used by the ingest / triage / execute scripts) ───────
  /** Ensure the backing store exists (mkdir .data for local). */
  ensureStore(): Promise<void>;
  readSnapshot(): Promise<Snapshot>;
  writeSnapshot(snapshot: Snapshot): Promise<void>;
  readConfig(): Promise<ConfigResult>;
  readLock(): Promise<Lock | null>;
  writeLock(lock: Lock): Promise<void>;
  clearLock(): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasks>;
  readOnboarding(): Promise<Onboarding>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  writeExecutionReport(report: ExecutionReport): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "submitDecision",
  "configSummary",
  "ensureStore",
  "readSnapshot",
  "writeSnapshot",
  "readConfig",
  "readLock",
  "writeLock",
  "clearLock",
  "readDecisions",
  "readAgentTasks",
  "readOnboarding",
  "readExecutionReport",
  "writeExecutionReport",
] as const satisfies readonly (keyof TicketsProvider)[];

/**
 * Assert `provider` conforms to {@link TicketsProvider}; throw one actionable
 * error listing everything missing. Call at registration (in createProvider) —
 * the runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(kind: string, provider: unknown): TicketsProvider {
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
      `Data provider "${kind}" does not satisfy TicketsProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as TicketsProvider;
}
