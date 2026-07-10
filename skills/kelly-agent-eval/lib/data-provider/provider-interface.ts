// The polymorphic contract shared by every provider (local-file today; a
// future postgres/aitable/notion/busabase backend later). See
// references/provider-interface.ts in app-in-skill-creator for the origin of
// this pattern. Adapted to the Agent Eval & Regression Board domain: cases are
// reviewed (mark_blocking / mark_acceptable), and a separate release verdict
// (approve_release / block_release) is recorded once per run.

export interface ReviewInput {
  id: string;
  action: "mark_blocking" | "mark_acceptable";
  note?: string;
}

export interface ReleaseInput {
  decision: "approve" | "block";
  note?: string;
}

export interface DataProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state`. */
  readonly name: string;

  // ── core (required) ────────────────────────────────────────────────────────
  getState(): Promise<Record<string, unknown>>;
  submitReview(review: ReviewInput): Promise<Record<string, unknown>>;
  submitReleaseDecision(input: ReleaseInput): Promise<Record<string, unknown>>;
  getConfigSummary(): Promise<Record<string, unknown>>;
  getLock(): Promise<Record<string, unknown>>;
  getOnboarding(): Promise<Record<string, unknown>>;
  completeOnboarding(marker?: Record<string, unknown>): Promise<Record<string, unknown>>;

  // ── optional extensions (provider-specific) ────────────────────────────────
  regenerateRun?(): Promise<Record<string, unknown>>;
}

export const CORE_METHODS = [
  "getState",
  "submitReview",
  "submitReleaseDecision",
  "getConfigSummary",
  "getLock",
  "getOnboarding",
  "completeOnboarding",
] as const satisfies readonly (keyof DataProvider)[];

export const OPTIONAL_METHODS = ["regenerateRun"] as const satisfies readonly (keyof DataProvider)[];

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
