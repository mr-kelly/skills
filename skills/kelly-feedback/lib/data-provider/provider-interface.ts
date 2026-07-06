// The data-provider contract for kelly-feedback + its runtime consistency guard.
//
// kelly-feedback is a feedback review / decision-queue App-in-Skill: a snapshot
// of feedback clusters into requests, an agent drafts proposals, and a human
// reviews them (approve / request_changes / block, plus feedback triage and
// request sizing). That review model maps cleanly onto Busabase's
// record + change_request + review + merge vocabulary, so the same UI and
// scripts run against either backend:
//
//   KELLY_FEEDBACK_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_FEEDBACK_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Every provider implements this same ReviewProvider surface, so callers get one
// from createProvider() and use it without knowing the backend. `assertProvider`
// is the runtime guard that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with `provider.getX is not a
// function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat these `.ts` files as ESM.

import type { AgentTasks, Decisions, FeedbackSnapshot, Lock, Onboarding } from "../types.ts";

// Workflow proposal statuses, shared across providers. Busabase maps its
// change-request status onto these so the UI renders identically in either mode.
export const PROPOSAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"] as const;

// The provider-neutral review verbs recordDecision accepts, by decision kind.
export const PROPOSAL_ACTIONS = ["approve", "request_changes", "block", "revise"] as const;
export const FEEDBACK_ACTIONS = ["assign", "ignore", "insight"] as const;

/** Aggregate payload backing `/api/state` (minus the demo/app framing). */
export interface ReviewState {
  onboarding: Onboarding;
  lock: Lock | null;
  decisions: Decisions;
  config_summary: Record<string, unknown>;
  snapshot: FeedbackSnapshot;
}

/**
 * The polymorphic contract shared by every provider. Core members are required;
 * they mirror the store surface the Hono server and scripts call.
 */
export interface ReviewProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── UI-facing (Hono server) ────────────────────────────────────────────────
  /** Aggregate payload for `/api/state`. */
  getState(): Promise<ReviewState>;
  /** Sanitized provider + config info for the UI (never secrets). */
  configSummary(): Record<string, unknown>;
  /** Apply a human verdict to a proposal / feedback item / request. */
  saveDecision(body: Record<string, unknown>): Promise<Decisions>;
  /** Lock status guarding writes (null when unlocked). */
  readLock(): Promise<Lock | null>;

  // ── handoff state (scripts) ────────────────────────────────────────────────
  /** The current feedback snapshot (falls back to an empty snapshot). */
  readSnapshot(): Promise<FeedbackSnapshot>;
  /** Persist the feedback snapshot. */
  writeSnapshot(snapshot: FeedbackSnapshot): Promise<void>;
  /** The current decisions ledger (falls back to an empty ledger). */
  readDecisions(): Promise<Decisions>;
  /** The agent task queue (revise_proposal etc.). */
  readAgentTasks(): Promise<AgentTasks>;
  /** Persist the agent task queue. */
  writeAgentTasks(tasks: AgentTasks): Promise<void>;
  /** Persist the dry-run/apply execution report. */
  writeExecutionReport(report: Record<string, unknown>): Promise<void>;
  /** Acquire the write lock; throws if already held. */
  acquireLock(message: string): Promise<Lock>;
  /** Release the write lock (no-op if unheld). */
  releaseLock(): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "configSummary",
  "saveDecision",
  "readLock",
  "readSnapshot",
  "writeSnapshot",
  "readDecisions",
  "readAgentTasks",
  "writeAgentTasks",
  "writeExecutionReport",
  "acquireLock",
  "releaseLock",
] as const satisfies readonly (keyof ReviewProvider)[];

/**
 * Assert `provider` conforms to {@link ReviewProvider}; throw one actionable
 * error listing everything missing. Call at registration (in createProvider())
 * — the runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(kind: string, provider: unknown): ReviewProvider {
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
      `Data provider "${kind}" does not satisfy ReviewProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as ReviewProvider;
}
