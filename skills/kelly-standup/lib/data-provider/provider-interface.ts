// The data-provider contract for kelly-standup.
//
// kelly-standup is a standup board: an agent ingests daily check-ins, tracks
// blockers, and drafts approval-gated nudges (reminders). A human reviews each
// nudge before it is sent. This interface is the polymorphic seam that lets the
// same Hono server and the same scripts run against either backend:
//
//   KELLY_STANDUP_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_STANDUP_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Members mirror the ACTUAL store surface (check-ins, blockers, reminders):
//
//   getState()             -> full /api/state payload (snapshot + config + tasks)
//   saveDecision(input)    -> apply a human verdict to one approval-gated nudge
//   listAgentTasks()       -> nudges the agent should revise (request_changes)
//   configSummary()        -> sanitized team/roster info for the UI
//   getLock()              -> agent write-lock guarding decisions
//   getSnapshot()          -> the normalized standup snapshot (ingest reads this)
//   putSnapshot(snapshot)  -> persist a freshly ingested snapshot
//   getDecisions()         -> stored human verdicts (execute reads these)
//   getExecutionReport()   -> last execution plan (execute reads/writes this)
//   putExecutionReport(r)  -> persist an execution plan
//   withLock(message, fn)  -> run fn while holding the agent write-lock
//
// saveDecision actions are the provider-neutral review verbs for a nudge:
//   approve | request_changes (ask the agent to revise) | revise | block
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat the `.ts` files as ESM. `class ... implements DataProvider`
// is the author-time check; assertProvider() is the runtime guard that makes a
// non-conforming provider fail loudly at registration instead of deep in a
// request with `provider.getX is not a function`.

import type {
  AgentTask,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  Decisions,
  ExecutionReport,
  Lock,
  StandupSnapshot,
  StatePayload,
} from "../types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state.data_provider. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for GET /api/state (non-demo). */
  getState(): Promise<StatePayload>;
  /** Apply a human verdict to one approval-gated nudge. */
  saveDecision(input: DecisionInput): Promise<DecisionResult>;
  /** Nudges the agent should pick up (request_changes queue). */
  listAgentTasks(): Promise<AgentTask[]>;
  /** Sanitized config / roster summary (never secrets). */
  configSummary(): ConfigSummary;
  /** Agent write-lock guarding decisions; null when unlocked. */
  getLock(): Promise<Lock | null>;
  /** The normalized standup snapshot the ingest script builds on. */
  getSnapshot(): Promise<StandupSnapshot>;
  /** Persist a freshly ingested snapshot. */
  putSnapshot(snapshot: StandupSnapshot): Promise<{ ok: boolean }>;
  /** Stored human verdicts (execute reads these to find approved nudges). */
  getDecisions(): Promise<Decisions>;
  /** The last execution plan, or null. */
  getExecutionReport(): Promise<ExecutionReport | null>;
  /** Persist an execution plan. */
  putExecutionReport(report: ExecutionReport): Promise<{ ok: boolean }>;
  /** Run fn while holding the agent write-lock, releasing it afterward. */
  withLock<T>(message: string, fn: () => Promise<T>): Promise<T>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "saveDecision",
  "listAgentTasks",
  "configSummary",
  "getLock",
  "getSnapshot",
  "putSnapshot",
  "getDecisions",
  "getExecutionReport",
  "putExecutionReport",
  "withLock",
] as const satisfies readonly (keyof DataProvider)[];

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
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
