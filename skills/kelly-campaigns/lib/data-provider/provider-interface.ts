// The data-provider contract for kelly-campaigns + a runtime consistency guard.
//
// kelly-campaigns is an App-in-Skill whose unit of work — an outbound send under
// review-before-schedule — maps onto Busabase's review model (record +
// change_request + review + merge). Every provider (local-file, busabase, and any
// future backend) implements the same `DataProvider` surface, so the Hono app and
// the batch scripts call `provider.*` without knowing the backend:
//
//   KELLY_CAMPAIGNS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_CAMPAIGNS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// `implements DataProvider` is checked at author time; `assertProvider()` is the
// runtime backstop that makes a non-conforming provider fail loudly at
// registration instead of deep in a request with `provider.getX is not a function`.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type { DecisionBody, SuppressionEntry } from "../types.ts";

/** Aggregate `/api/state` payload; superset shape is provider-defined. */
export type StatePayload = Record<string, unknown>;

/** Result of a suppression pre-send check against a send's target segment/address. */
export interface SuppressionCheck {
  suppressed_count: number;
  // true when an explicitly targeted address is on the suppression list -> block.
  blocked: boolean;
  matched: SuppressionEntry[];
  note: string;
}

/**
 * The polymorphic contract shared by every provider. Core members are required;
 * they mirror the surface app/server/store.ts exposed before the retrofit, plus
 * the consent/suppression members.
 */
export interface DataProvider {
  /** Stable provider id, echoed in `/api/state.data_provider`. */
  readonly name: string;

  // ── core reads (required) ──────────────────────────────────────────────────
  /** Aggregate payload for `/api/state`. */
  getState(): Promise<StatePayload>;
  /** Sanitized config summary (never secrets). */
  getConfigSummary(): Promise<Record<string, unknown>>;
  /** Lock status guarding writes (null when unlocked). */
  getLock(): Promise<Record<string, unknown> | null>;
  /** Queued agent work (sends the human asked to revise). */
  getAgentTasks(): Promise<Record<string, unknown>>;

  // ── core writes (required) ─────────────────────────────────────────────────
  /** Apply a human verdict to one send. */
  applyDecision(payload: DecisionBody): Promise<Record<string, unknown>>;

  // ── consent / suppression (required) ───────────────────────────────────────
  /** The suppression list: recipients/segments removed by unsubscribe/bounce/complaint. */
  getSuppression(): Promise<Record<string, unknown>>;
  /** Evaluate a send's target against the suppression list for the pre-send gate. */
  evaluateSuppression(send: Record<string, unknown>): Promise<SuppressionCheck>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "getConfigSummary",
  "getLock",
  "getAgentTasks",
  "applyDecision",
  "getSuppression",
  "evaluateSuppression",
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
  if (typeof candidate.name !== "string" || !candidate.name) problems.push("name (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
