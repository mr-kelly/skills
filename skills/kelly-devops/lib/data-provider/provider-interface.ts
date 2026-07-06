// The data-provider contract for kelly-devops + its runtime consistency guard.
//
// kelly-devops is an ops review desk: an ops snapshot (services, expiries,
// spend, action cards, events) is prepared by the check scripts, and a human
// reviews the action cards (approve / request_changes / block / note). Every
// provider — the local-file default and the Busabase backend — implements this
// same `DataProvider` shape, so hono.ts and the scripts get one from
// `createProvider()` and use it without knowing the backend.
//
// `assertProvider()` is the runtime guard: a non-conforming provider fails
// loudly at registration instead of deep in a request with
// `provider.getSnapshot is not a function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace/decorators/parameter-properties), NO build step.

import type {
  AgentTask,
  ConfigSummary,
  Decision,
  DecisionInput,
  DevopsSnapshot,
  DevopsState,
  Lock,
  Onboarding,
  OpsAction,
} from "../types.ts";

// The polymorphic contract shared by every provider. `getState` is the
// aggregate the UI reads; the read/write snapshot pair and the lock trio are
// what the check scripts use as their persistence seam; applyDecision is the
// review-queue write path.
export interface DataProvider {
  // Stable provider id, e.g. "local". Echoed in /api/state as data_provider.
  readonly name: string;

  // ── dashboard (aggregate read) ─────────────────────────────────────────────
  // Full /api/state payload for real (non-demo) mode.
  getState(): Promise<DevopsState>;

  // ── ops snapshot (script persistence seam) ─────────────────────────────────
  getSnapshot(): Promise<DevopsSnapshot>;
  saveSnapshot(snapshot: DevopsSnapshot): Promise<void>;

  // ── review queue ───────────────────────────────────────────────────────────
  // Apply a human verdict to one action card; returns the updated action and
  // the recorded decision.
  applyDecision(input: DecisionInput): Promise<{ action: OpsAction; decision: Decision }>;
  // Items queued for the agent after a request_changes verdict.
  getAgentTasks(): Promise<AgentTask[]>;

  // ── config / onboarding / lock ─────────────────────────────────────────────
  getConfigSummary(): Promise<ConfigSummary>;
  getOnboarding(): Promise<Onboarding>;
  completeOnboarding(marker?: Partial<Onboarding>): Promise<Onboarding>;
  getLock(): Promise<Lock | null>;
  acquireLock(owner: string, message: string): Promise<void>;
  releaseLock(): Promise<void>;

  // ── optional extension (remote providers) ──────────────────────────────────
  // Probe connectivity; local providers may omit this.
  verifyConnection?(): Promise<Record<string, unknown>>;
}

// Members every provider MUST implement (kept in sync with the interface).
export const CORE_METHODS = [
  "getState",
  "getSnapshot",
  "saveSnapshot",
  "applyDecision",
  "getAgentTasks",
  "getConfigSummary",
  "getOnboarding",
  "completeOnboarding",
  "getLock",
  "acquireLock",
  "releaseLock",
] as const satisfies readonly (keyof DataProvider)[];

// Members a provider MAY implement; validated only when present.
export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

// Assert `provider` conforms to DataProvider; throw one actionable error listing
// everything missing. Call at registration (in createProvider()) — the runtime
// backstop to the compile-time contract.
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
