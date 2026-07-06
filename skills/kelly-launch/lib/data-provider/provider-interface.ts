// The data-provider contract for kelly-launch + the runtime consistency guard.
//
// kelly-launch is an App-in-Skill whose unit of work — a launch checklist item
// under review-before-ship — maps onto Busabase's review model (record +
// change_request + operation + commit + review + merge). Every provider
// (local-file, busabase, and future backends) implements this same
// `DataProvider` shape, so hono.ts and scripts/*.ts get one from
// `createProvider()` and use it without knowing the backend.
//
// `class … implements DataProvider` would be author-time checking; here we use
// object literals, so `assertProvider()` is the runtime guard that makes a
// non-conforming provider fail loudly at registration instead of deep in a
// request with `provider.getState is not a function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}`
// makes Node treat these `.ts` files as ESM.

import type { Config, ConfigResult, DecisionBody } from "../types.ts";

export interface DataProvider {
  /** Stable provider id, e.g. `"local"` / `"busabase"`. Echoed in `/api/state`. */
  readonly kind: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for `/api/state` (without the `app` key hono prepends). */
  getState(): Promise<Record<string, unknown>>;
  /** Apply a human verdict / edit to one launch item; returns the decisions file. */
  applyDecision(payload: DecisionBody): Promise<Record<string, unknown>>;
  /** Lock status guarding writes (null when unlocked). Hono checks this first. */
  readLock(): Promise<Record<string, unknown> | null>;
  /** Sanitized config summary (never secrets). */
  configSummary(): Promise<Record<string, unknown>> | Record<string, unknown>;

  // ── granular reads used by scripts + getState (required) ────────────────────
  readSnapshot(): Promise<Record<string, unknown>>;
  readDecisions(): Promise<Record<string, unknown>>;
  readAgentTasks(): Promise<Record<string, unknown>>;
  readExecutionReport(): Promise<Record<string, unknown> | null>;
  readOnboarding(): Promise<Record<string, unknown>>;
  readConfig(): Promise<ConfigResult>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  /** Persist an execution report (local scripts). */
  writeExecutionReport?(report: Record<string, unknown>): Promise<void>;
  /** Seed / overwrite the launch snapshot (local demo + agent scripts). */
  writeSnapshot?(snapshot: Record<string, unknown>): Promise<void>;
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "readLock",
  "configSummary",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "readConfig",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = [
  "writeExecutionReport",
  "writeSnapshot",
  "verifyConnection",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Called at registration (in createProvider()) — the
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

// Shared vocabulary, exported so providers + scripts agree on the verbs.
export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"] as const;
export const WORKFLOW_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"] as const;

// summarizeConfig is pure (config -> sanitized summary) and shared by both
// providers, so it lives on the interface module rather than in one provider.
export function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const config: Config = configResult.config || {};
  const channels = Array.isArray(config.channels) ? config.channels : [];
  const product = (config.product as Record<string, unknown>) || {};
  const launch = (config.launch as Record<string, unknown>) || {};
  const pressLists = Array.isArray(config.press_lists) ? config.press_lists : [];
  const readinessPolicy = (config.readiness_policy as Record<string, unknown>) || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    product: {
      name: product.name || "",
      tagline: product.tagline || "",
      homepage: product.homepage || "",
      category: product.category || "",
    },
    launch: {
      target_date: launch.target_date || "",
      timezone: launch.timezone || "UTC",
    },
    style_tone: (config.style as Record<string, unknown>)?.tone || "",
    press_lists: pressLists.map((list: Record<string, unknown>) => ({
      list_id: list.list_id || "",
      display_name: list.display_name || list.list_id || "",
    })),
    readiness_policy: {
      block_on: Array.isArray(readinessPolicy.block_on) ? readinessPolicy.block_on : [],
      min_ship_ratio: typeof readinessPolicy.min_ship_ratio === "number" ? readinessPolicy.min_ship_ratio : null,
    },
    channels: channels.map((channel: Record<string, unknown>) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        handoff_skill: channel.handoff_skill || "",
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key] as string])),
      };
    }),
  };
}
