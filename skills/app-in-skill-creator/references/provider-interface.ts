// Copyable template: the data-provider interface + consistency guard.
//
// Drop this into `lib/data-provider/provider-interface.mjs` and adapt CORE_METHODS
// to your domain. Every provider (local-file, and future db/cloud backends)
// implements the same shape, so callers get one from `getProvider()` and use it
// without knowing the backend. `assertProvider()` is the runtime guard that makes
// a non-conforming provider fail loudly at registration instead of deep in a
// request with `provider.getX is not a function`.
//
// TWO equivalent ways to express the contract:
//   • .mjs (this file): a JSDoc @typedef + the runtime guard. Runs on any Node.
//   • .ts (Node ≥23.6): a real `interface` + `class … implements` for compile-time
//     checks. Erasable TypeScript only (no enum/namespace), run via native
//     type-stripping — still no build. Add `lib/package.json {"type":"module"}`.
// Keep the runtime guard either way — it protects dynamic/JS callers.

/**
 * @typedef {Object} DataProvider
 * The polymorphic contract shared by every provider. Adapt the member list to
 * your skill's handoff files (see the File Contract section of the spec).
 *
 * ── core (required) ──────────────────────────────────────────────────────────
 * @property {string} name                              Stable provider id, e.g. "local".
 * @property {() => Promise<object>} getState           Aggregate payload for `/api/state`.
 * @property {(review: object) => Promise<object>} submitReview  Apply a human verdict.
 * @property {() => Promise<object>} getAgentTasks      Queued agent work (changes_requested / @ai).
 * @property {() => Promise<object>} getConfigSummary   Sanitized config (never secrets).
 * @property {() => Promise<object>} getLock            Lock status guarding writes.
 * @property {() => Promise<object>} getOnboarding      Onboarding marker.
 * @property {(marker?: object) => Promise<object>} completeOnboarding  Write the marker.
 *
 * ── optional extensions (provider-specific) ─────────────────────────────────
 * @property {(input: object, options?: object) => Promise<object>} [createItem]
 * @property {() => Promise<object>} [verifyConnection]  Probe connectivity (remote providers).
 */

/** Members every provider MUST implement. Adapt to your domain. */
export const CORE_METHODS = Object.freeze([
  "getState",
  "submitReview",
  "getAgentTasks",
  "getConfigSummary",
  "getLock",
  "getOnboarding",
  "completeOnboarding",
]);

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = Object.freeze(["createItem", "verifyConnection"]);

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in getProvider()).
 * @param {string} name
 * @param {unknown} provider
 * @returns {DataProvider}
 */
export function assertProvider(name, provider) {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${name}" is not an object.`);
  }
  const problems = [];
  if (typeof provider.name !== "string" || !provider.name) problems.push("name (string)");
  for (const method of CORE_METHODS) {
    if (typeof provider[method] !== "function") problems.push(`${method}()`);
  }
  for (const method of OPTIONAL_METHODS) {
    if (method in provider && typeof provider[method] !== "function") {
      problems.push(`${method}() [optional, must be a function if present]`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider;
}

// ── Usage in lib/data-provider/index.mjs ─────────────────────────────────────
//
//   import * as localFileProvider from "./local-file-provider.mjs";
//   import { assertProvider } from "./provider-interface.mjs";
//
//   const providers = { local: localFileProvider /*, postgres, busabase, … */ };
//   const validated = new Map();
//
//   export function getProvider() {
//     const selected = process.env.<SKILL_ENV_PREFIX>_DATA_PROVIDER || "local";
//     if (validated.has(selected)) return validated.get(selected);
//     const provider = providers[selected];
//     if (!provider) throw new Error(`Unknown provider "${selected}".`);
//     const conformed = assertProvider(selected, provider); // fail loud at registration
//     validated.set(selected, conformed);
//     return conformed;
//   }
