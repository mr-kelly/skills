// The polymorphic contract every kelly-legal-contracts data provider implements. It
// mirrors the surface the old app/server/store.ts exposed (the read functions
// the Hono server and scripts call, plus applyDecision), and adds the
// claims/compliance registry. Callers get a provider from createProvider() in
// index.ts and use it without knowing whether it is backed by local JSON files
// or a remote Busabase base.
//
// `assertProvider()` is the runtime guard: a non-conforming provider fails
// loudly at registration instead of deep in a request with
// "provider.getState is not a function".

import type { ClaimPayload, ClaimRule, ClaimsRegistry, ConfigResult, DecisionPayload, Snapshot } from "../types.ts";

// Aggregate payload for GET /api/state (the shape app.js consumes).
export interface LegalContractsState {
  app: string;
  data_provider: string;
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: Record<string, unknown>;
  decisions: Record<string, unknown>;
  agent_tasks: Record<string, unknown>;
  execution_report: Record<string, unknown> | null;
  claims: ClaimsRegistry;
  snapshot: Snapshot | Record<string, unknown>;
  [key: string]: unknown;
}

export interface DataProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state.data_provider. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for GET /api/state. */
  getState(): Promise<LegalContractsState>;
  /** Apply a human verdict (approve / request_changes / block / revise). */
  applyDecision(payload: DecisionPayload): Promise<Record<string, unknown>>;
  /** Current agent lock guarding writes (null when unlocked). */
  readLock(): Promise<Record<string, unknown> | null>;
  /** Loaded config + source path (sanitized summary lives in getState). */
  readConfig(): Promise<ConfigResult>;

  // ── raw store access (used by scripts) ─────────────────────────────────────
  // These read/return the on-disk JSON handoff files, which scripts mutate in
  // place before writing back. They are loose by design (Snapshot carries an
  // index signature; decisions/tasks/report are dynamic bags).
  readSnapshot(): Promise<Snapshot>;
  writeSnapshot(snapshot: unknown): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  writeAgentTasks(tasks: unknown): Promise<void>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  writeExecutionReport(report: unknown): Promise<void>;

  // ── clause playbook / risk registry ────────────────────────────────────────
  /** Approved fallback clauses + banned/restricted-phrase rules. */
  readClaims(): Promise<ClaimsRegistry>;
  /** Persist the whole claims registry (used by seeding scripts). */
  writeClaims(registry: ClaimsRegistry): Promise<void>;
  /** Upsert one claim (approve / edit substantiation / change status). */
  saveClaim(payload: ClaimPayload): Promise<Record<string, unknown>>;
  /** Upsert one banned-word / restricted-phrase rule. */
  saveClaimRule(payload: Partial<ClaimRule>): Promise<Record<string, unknown>>;
}

// Loose shapes for the dynamic JSON handoff files scripts mutate.
export interface DecisionsFile {
  updated_at?: string;
  decisions: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface AgentTasksFile {
  updated_at?: string;
  tasks: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface ExecutionReport {
  executed_at?: string;
  dry_run?: boolean;
  source?: string;
  results: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "readLock",
  "readConfig",
  "readSnapshot",
  "writeSnapshot",
  "readDecisions",
  "readAgentTasks",
  "writeAgentTasks",
  "readExecutionReport",
  "writeExecutionReport",
  "readClaims",
  "writeClaims",
  "saveClaim",
  "saveClaimRule",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in createProvider()).
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
