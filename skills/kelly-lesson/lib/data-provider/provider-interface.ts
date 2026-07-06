// The data-provider contract for kelly-lesson.
//
// kelly-lesson is an App-in-Skill whose unit of work — a lesson plan under
// review-before-approval — maps onto Busabase's review model (record +
// change_request + operation + commit + review + merge). Every backend
// (local-file default, Busabase remote) implements this same LessonProvider
// shape, so the Hono server and the batch scripts get one from
// createProvider() and use it without knowing the backend.
//
// The member list mirrors the ACTUAL store surface that hono.ts + scripts/*.ts
// called directly before this layer existed:
//
//   getState()             -> aggregate payload for GET /api/state
//   applyDecision(payload) -> apply a human verdict/edit to one review item
//   configSummary()        -> sanitized provider/config info for the UI
//   readSnapshot()         -> the lesson snapshot (plans/teachers/checks/...)
//   readDecisions()        -> the recorded human verdicts
//   readAgentTasks()       -> queued agent work (revise_plan tasks)
//   readExecutionReport()  -> last executor run report (or null)
//   readOnboarding()       -> onboarding marker
//   readLock()             -> agent write-lock (or null)
//   writeSnapshot(s)       -> persist the snapshot (ingest / checks scripts)
//   writeDecisions(d)      -> persist decisions
//   writeAgentTasks(t)     -> persist the agent-task queue
//   writeExecutionReport(r)-> persist the executor report
//
// applyDecision actions are the provider-neutral review verbs:
//   approve | revise (save human edits) | request_changes (ask the agent) | block
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json is {"type":"module"}.

import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  LessonSnapshot,
  LessonState,
  Lock,
  Onboarding,
} from "../types.ts";

export interface LessonProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── aggregate + review ──────────────────────────────────────────────────
  /** Aggregate payload for GET /api/state. */
  getState(): Promise<LessonState>;
  /** Apply a human verdict/edit to one review item; returns the decisions file. */
  applyDecision(payload?: DecisionBody): Promise<DecisionsFile>;
  /** Sanitized config summary for the UI (never secrets). */
  configSummary(): ConfigSummary;
  /** The resolved config + its source path (drives configSummary + scripts). */
  readConfig(): Promise<ConfigResult>;

  // ── granular reads (used by the batch scripts) ──────────────────────────
  readSnapshot(): Promise<LessonSnapshot>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  readOnboarding(): Promise<Onboarding>;
  readLock(): Promise<Lock | null>;

  // ── writes (used by the batch scripts) ──────────────────────────────────
  writeSnapshot(snapshot: LessonSnapshot): Promise<void>;
  writeDecisions(decisions: DecisionsFile): Promise<void>;
  writeAgentTasks(tasks: AgentTasksFile): Promise<void>;
  writeExecutionReport(report: ExecutionReport): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "configSummary",
  "readConfig",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "readLock",
  "writeSnapshot",
  "writeDecisions",
  "writeAgentTasks",
  "writeExecutionReport",
] as const satisfies readonly (keyof LessonProvider)[];

/**
 * Assert `provider` conforms to {@link LessonProvider}; throw one actionable
 * error listing everything missing. Call at registration (in createProvider())
 * — the runtime backstop to the compile-time `implements`/return-type check, so
 * a non-conforming provider fails loudly instead of deep in a request with
 * `provider.getX is not a function`.
 */
export function assertProvider(name: string, provider: unknown): LessonProvider {
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
      `Data provider "${name}" does not satisfy LessonProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as LessonProvider;
}
