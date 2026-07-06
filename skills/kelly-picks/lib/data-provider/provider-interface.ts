// The polymorphic contract shared by every kelly-picks data provider.
//
// kelly-picks is a product-research radar: an agent sweeps sources, ingests
// trend/candidate payloads, computes margin cards, and the human reviews each
// candidate/proposal/trend with a develop/watch/drop verdict. That whole unit of
// work — a snapshot of candidates plus a decisions ledger plus an agent-task
// queue — is what a provider stores. This interface mirrors the ACTUAL store
// surface the Hono server and the scripts (compute_margins / ingest_trends /
// execute_decisions / generate_demo_snapshot) call, so
// KELLY_PICKS_DATA_PROVIDER=local|busabase is a config switch, not a rewrite:
//
//   getState()            -> aggregate payload for /api/state (byte-identical to
//                            the pre-lib server in local mode)
//   saveDecision(body)    -> apply a human verdict (candidate develop/watch/drop,
//                            proposal approve/request_changes/revise/block,
//                            trend promote) and enqueue any agent follow-up
//   configSummary()       -> sanitized provider/config info for the UI
//
// Plus the storage primitives the scripts share (they read the snapshot, mutate
// it deterministically, and write it back under the agent lock):
//   readSnapshot / writeSnapshot / readDecisions / readAgentTasks /
//   readExecutionReport / writeExecutionReport / readOnboarding / readLock /
//   acquireLock / releaseLock / readConfig / ensureReady
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json {"type":"module"} makes
// Node treat these .ts files as ESM.

import type {
  AgentTasksFile,
  Config,
  ConfigResult,
  DecisionBody,
  DecisionsFile,
  LockInfo,
  Onboarding,
  PicksSnapshot,
} from "../types.ts";

export interface SaveDecisionResult {
  ok: boolean;
  status?: number;
  error?: string;
  decision?: Record<string, unknown>;
}

export interface PicksState {
  app: string;
  data_provider: string;
  onboarding: Onboarding;
  lock: LockInfo | null;
  agent_tasks: AgentTasksFile;
  execution_report: unknown;
  config_summary: Record<string, unknown>;
  snapshot: PicksSnapshot;
}

export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state as data_provider. */
  readonly kind: string;

  // ── review surface (used by the Hono server) ───────────────────────────────
  /** Aggregate payload for GET /api/state. */
  getState(): Promise<PicksState>;
  /** Apply a human verdict to a candidate / proposal / trend. */
  saveDecision(body: DecisionBody): Promise<SaveDecisionResult>;
  /** Sanitized provider + config summary (never secrets). */
  configSummary(): Promise<Record<string, unknown>>;

  // ── storage primitives (shared by the scripts) ─────────────────────────────
  /** Ensure any backing store (dirs / connection) exists. */
  ensureReady(): Promise<void>;
  readSnapshot(): Promise<PicksSnapshot>;
  writeSnapshot(snapshot: PicksSnapshot): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readExecutionReport(): Promise<unknown>;
  writeExecutionReport(report: unknown): Promise<void>;
  readOnboarding(): Promise<Onboarding>;
  readLock(): Promise<LockInfo | null>;
  acquireLock(owner: string, message: string): Promise<void>;
  releaseLock(): Promise<void>;
  readConfig(): Promise<ConfigResult>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "saveDecision",
  "configSummary",
  "ensureReady",
  "readSnapshot",
  "writeSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "writeExecutionReport",
  "readOnboarding",
  "readLock",
  "acquireLock",
  "releaseLock",
  "readConfig",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()) — the
 * runtime backstop that makes a non-conforming provider fail loudly at startup
 * instead of deep in a request with `provider.readSnapshot is not a function`.
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

// Config as loaded by the provider layer; re-exported for convenience.
export type { Config };
