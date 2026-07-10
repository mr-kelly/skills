// The polymorphic contract shared by every data provider (local files today;
// postgres/aitable/notion/busabase later). Adapt of the app-in-skill-creator
// template to the deal-scoring queue's file contract.

export interface ReviewInput {
  id: string;
  action: "approve_term_sheet" | "send_back_for_data" | "reject";
  comment?: string;
}

export interface DataProvider {
  readonly name: string;

  // ── core (required) ──────────────────────────────────────────────────────
  getState(): Promise<Record<string, unknown>>;
  submitReview(review: ReviewInput): Promise<Record<string, unknown>>;
  getAgentTasks(): Promise<Record<string, unknown>>;
  getConfigSummary(): Promise<Record<string, unknown>>;
  getLock(): Promise<Record<string, unknown>>;
  getOnboarding(): Promise<Record<string, unknown>>;
  completeOnboarding(marker?: Record<string, unknown>): Promise<Record<string, unknown>>;

  // ── optional extensions ──────────────────────────────────────────────────
  verifyConnection?(): Promise<Record<string, unknown>>;
}

export const CORE_METHODS = [
  "getState",
  "submitReview",
  "getAgentTasks",
  "getConfigSummary",
  "getLock",
  "getOnboarding",
  "completeOnboarding",
] as const satisfies readonly (keyof DataProvider)[];

export const OPTIONAL_METHODS = ["verifyConnection"] as const satisfies readonly (keyof DataProvider)[];

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
