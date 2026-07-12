import type { DecisionBody } from "../types.ts";

export interface ProviderStatus {
  ok: boolean;
  provider: string;
  mode?: string;
  message?: string;
  action?: string;
  connection?: Record<string, unknown>;
  error?: string;
}

export interface DataProvider {
  readonly name: string;
  getState(): Promise<unknown>;
  submitReview(review: DecisionBody): Promise<unknown>;
  getAgentTasks(): Promise<unknown>;
  getConfigSummary(): Promise<unknown>;
  getLock(): Promise<unknown | null>;
  getOnboarding(): Promise<unknown>;
  completeOnboarding(marker?: Record<string, unknown>): Promise<unknown>;
  selectProvider?(provider: string): Promise<unknown>;
  providerStatus?(): Promise<ProviderStatus | Record<string, unknown>>;
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

export const OPTIONAL_METHODS = ["selectProvider", "providerStatus"] as const satisfies readonly (keyof DataProvider)[];

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
    throw new Error(`Data provider "${name}" does not satisfy DataProvider: ${problems.join(", ")}`);
  }
  return provider as DataProvider;
}
