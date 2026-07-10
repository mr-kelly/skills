// The polymorphic data-provider contract for kelly-llm-gateway. Adapted from
// app-in-skill-creator/references/provider-interface.ts. Every provider (the
// default local-file provider, and future db/cloud backends) implements this
// same shape so the Hono app and scripts can call `getProvider()` without
// knowing the backend. `class … implements DataProvider` is checked at author
// time; `assertProvider()` is the runtime guard that fails loud at registration
// instead of deep in a request with `provider.getX is not a function`.

import type { Decisions, GatewaySnapshot, RolloutAction } from "../../app/server/types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly name: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** The current gateway snapshot (services/models/routes/spend/anomalies). */
  getSnapshot(): Promise<GatewaySnapshot>;
  /** Local handoff decisions: rollout verdicts and anomaly acks. */
  getDecisions(): Promise<Decisions>;
  /** Record a rollout verdict (promote|rollback|hold) for one route. */
  recordRolloutDecision(routeId: string, action: RolloutAction, note: string): Promise<Decisions>;
  /** Acknowledge a cost/error anomaly. */
  recordAnomalyAck(anomalyId: string, note: string): Promise<Decisions>;
  /** Sanitized config summary (never secrets). */
  getConfigSummary(): Promise<Record<string, unknown>>;
  /** Lock status guarding writes. */
  getLock(): Promise<unknown>;
  /** Onboarding marker. */
  getOnboarding(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getSnapshot",
  "getDecisions",
  "recordRolloutDecision",
  "recordAnomalyAck",
  "getConfigSummary",
  "getLock",
  "getOnboarding",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable
 * error listing everything missing. Call at registration (in getProvider()).
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
  if (problems.length) {
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
