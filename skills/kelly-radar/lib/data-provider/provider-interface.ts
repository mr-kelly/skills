// The data-provider interface for kelly-radar + its runtime consistency guard.
//
// kelly-radar is a review desk over three workflows — competitor monitoring
// (signals), a research workbench with brief approval (questions/briefs/reports),
// and trend tracking (movers/opportunities). Every provider (local-file today,
// Busabase next) implements the same `RadarProvider` shape, so the Hono server
// and the batch scripts reach storage through one seam and stay backend-agnostic.
//
// `implements RadarProvider` is the author-time check; `assertProvider()` is the
// runtime backstop that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with `provider.getX is not a
// function`. Runs on Node ≥23.6 via native type-stripping — erasable TypeScript
// only (no enum/namespace), no build step; `lib/package.json` `{"type":"module"}`
// makes Node treat these `.ts` files as ESM.

import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  Lock,
  Onboarding,
  RadarSnapshot,
} from "../types.ts";

// Result of a write to /api/decision or /api/task. Mirrors the original
// DecisionResult so the Hono layer maps { ok, status } onto HTTP identically.
export interface DecisionResult {
  ok: boolean;
  status?: number;
  error?: string;
  decision?: Record<string, unknown>;
  task?: Record<string, unknown>;
}

// Aggregate payload for GET /api/state (decisions already applied to the snapshot).
export interface RadarState {
  app: string;
  data_provider: string;
  onboarding: Onboarding;
  lock: Lock | null;
  agent_tasks: AgentTasksFile;
  config_summary: ConfigSummary;
  snapshot: RadarSnapshot;
}

export interface IngestSignalsResult {
  added: number;
  skipped: number;
  snapshot_path: string;
}

export interface IngestTrendsResult {
  added: number;
  updated: number;
  opportunities_added: number;
  seo_imported: number;
  snapshot_path: string;
}

export interface FileReportResult {
  detail: string;
  snapshot_path: string;
}

export interface ExecutionOperation {
  id: string;
  kind: string;
  operation: string;
  target: string;
  summary: string;
  note: string;
  dry_run: boolean;
  status: string;
}

export interface ExecuteDecisionsResult {
  apply: boolean;
  operations: ExecutionOperation[];
  report_path: string;
}

// The polymorphic contract shared by every provider.
export interface RadarProvider {
  /** Stable provider id, e.g. "local". Echoed in /api/state as data_provider. */
  readonly name: string;

  // ── high-level app surface (Hono server) ──────────────────────────────────
  /** Aggregate payload for GET /api/state. */
  getState(): Promise<RadarState>;
  /** Apply a human triage verdict to a signal / brief / opportunity / report. */
  saveDecision(body: DecisionBody): Promise<DecisionResult>;
  /** Queue a research follow-up question for the agent. */
  saveFollowup(body: DecisionBody): Promise<DecisionResult>;
  /** Sanitized config summary (never secrets). */
  getConfigSummary(): Promise<ConfigSummary>;
  /** Loaded config + source path, for scripts that echo where config came from. */
  readConfig(): Promise<ConfigResult>;

  // ── state reads (server + scripts) ────────────────────────────────────────
  readSnapshot(): Promise<RadarSnapshot>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readOnboarding(): Promise<Onboarding>;
  getLock(): Promise<Lock | null>;

  // ── lock guard (script write-paths) ───────────────────────────────────────
  acquireLock(owner: string, message: string): Promise<void>;
  releaseLock(): Promise<void>;

  // ── agent write-paths (scripts) ───────────────────────────────────────────
  /** Ingest agent-collected competitor signals (dedup by content hash). */
  ingestSignals(payload: Record<string, unknown>): Promise<IngestSignalsResult>;
  /** Ingest trend movers + opportunities, with optional imported SEO movers. */
  ingestTrends(payload: Record<string, unknown>, seoImported?: Record<string, unknown>[]): Promise<IngestTrendsResult>;
  /** File a research brief or a finished report against a question. */
  fileReport(payload: Record<string, unknown>): Promise<FileReportResult>;
  /** Turn approved items into execution operations (dry-run unless apply). */
  executeDecisions(apply: boolean): Promise<ExecuteDecisionsResult>;
  /** Write the deterministic demo snapshot into the live snapshot slot. */
  writeDemoSnapshot(): Promise<{ snapshot_path: string }>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "saveDecision",
  "saveFollowup",
  "getConfigSummary",
  "readConfig",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readOnboarding",
  "getLock",
  "acquireLock",
  "releaseLock",
  "ingestSignals",
  "ingestTrends",
  "fileReport",
  "executeDecisions",
  "writeDemoSnapshot",
] as const satisfies readonly (keyof RadarProvider)[];

/**
 * Assert `provider` conforms to {@link RadarProvider}; throw one actionable error
 * listing everything missing. Called at registration in createProvider() — the
 * runtime backstop to the compile-time `implements` check.
 */
export function assertProvider(name: string, provider: unknown): RadarProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${name}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.name !== "string" || !candidate.name) problems.push("name (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${name}" does not satisfy RadarProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as RadarProvider;
}
