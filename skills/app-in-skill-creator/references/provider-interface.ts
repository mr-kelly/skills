// Copyable template: the data-provider interface + consistency guard.
//
// Drop this into `lib/data-provider/provider-interface.ts` and adapt the members
// to your domain. Every provider (local-file, and future db/cloud backends)
// implements the same `DataProvider` shape, so callers get one from
// `getProvider()` and use it without knowing the backend. `class … implements
// DataProvider` is checked at author time; `assertProvider()` is the runtime guard
// that makes a non-conforming provider fail loudly at registration instead of deep
// in a request with `provider.getX is not a function`.
//
// Runs on Node ≥23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. Add `lib/package.json` `{"type":"module"}`
// so Node treats the `.ts` as ESM. Targeting older Node? Express the same contract
// as a `.mjs` JSDoc `@typedef` plus the `assertProvider` guard below — equivalent.

/** Input to a human verdict on an item. Adapt to your domain. */
export interface ReviewInput {
  id?: string;
  action?: string;
  comment?: string;
  [key: string]: unknown;
}

/**
 * The polymorphic contract shared by every provider. Adapt the member list to
 * your skill's handoff files (see the File Contract section of the spec). Core
 * members are required; the trailing optionals are provider-specific extensions.
 */
export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly name: string;

  // ── core (required) ────────────────────────────────────────────────────────
  /** Aggregate payload for `/api/state`. */
  getState(): Promise<Record<string, unknown>>;
  /** Apply a human verdict to an item. */
  submitReview(review: ReviewInput): Promise<Record<string, unknown>>;
  /** Queued agent work (items in `changes_requested` or carrying an `@ai` comment). */
  getAgentTasks(): Promise<Record<string, unknown>>;
  /** Sanitized config summary (never secrets). */
  getConfigSummary(): Promise<Record<string, unknown>>;
  /** Lock status guarding writes. */
  getLock(): Promise<Record<string, unknown>>;
  /** Onboarding marker. */
  getOnboarding(): Promise<Record<string, unknown>>;
  /** Write the onboarding completion marker. */
  completeOnboarding(marker?: Record<string, unknown>): Promise<Record<string, unknown>>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  createItem?(input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  /** Probe connectivity (remote providers). */
  verifyConnection?(): Promise<Record<string, unknown>>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "submitReview",
  "getAgentTasks",
  "getConfigSummary",
  "getLock",
  "getOnboarding",
  "completeOnboarding",
] as const satisfies readonly (keyof DataProvider)[];

/** Members a provider MAY implement; validated only when present. */
export const OPTIONAL_METHODS = [
  "createItem",
  "verifyConnection",
] as const satisfies readonly (keyof DataProvider)[];

/**
 * Assert `provider` conforms to {@link DataProvider}; throw one actionable error
 * listing everything missing. Call at registration (in getProvider()) — the
 * runtime backstop to the compile-time `implements` check.
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
  for (const method of OPTIONAL_METHODS) {
    if (method in candidate && typeof candidate[method] !== "function") {
      problems.push(`${method}() [optional, must be a function if present]`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as DataProvider;
}

// ── Usage in lib/data-provider/index.ts ──────────────────────────────────────
//
//   import { localFileProvider } from "./local-file-provider.ts";
//   import { assertProvider, type DataProvider } from "./provider-interface.ts";
//
//   const providers: Record<string, DataProvider> = { local: localFileProvider /*, … */ };
//   const validated = new Map<string, DataProvider>();
//
//   export function getProvider(): DataProvider {
//     const selected = process.env.<SKILL_ENV_PREFIX>_DATA_PROVIDER || "local";
//     const cached = validated.get(selected);
//     if (cached) return cached;
//     const provider = providers[selected];
//     if (!provider) throw new Error(`Unknown provider "${selected}".`);
//     const conformed = assertProvider(selected, provider); // fail loud at registration
//     validated.set(selected, conformed);
//     return conformed;
//   }
//
// Each provider is `export class LocalFileProvider implements DataProvider { … }`
// with `export const localFileProvider = new LocalFileProvider();`.
