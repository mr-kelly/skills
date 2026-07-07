import type { ConfigResult, DecisionBody, DecisionsFile, InvoiceBatch } from "../types.ts";

export interface DataProvider {
  readonly kind: string;

  getState(): Promise<Record<string, unknown>>;
  applyDecision(payload: DecisionBody): Promise<Record<string, unknown>>;
  readBatch(): Promise<InvoiceBatch>;
  writeBatch(batch: InvoiceBatch): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<Record<string, unknown>>;
  readExecutionReport(): Promise<Record<string, unknown> | null>;
  writeExecutionReport(report: Record<string, unknown>): Promise<void>;
  readOnboarding(): Promise<Record<string, unknown>>;
  completeOnboarding(marker?: Record<string, unknown>): Promise<Record<string, unknown>>;
  readLock(): Promise<Record<string, unknown> | null>;
  readConfig(): Promise<ConfigResult>;
  configSummary(): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "readBatch",
  "writeBatch",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "writeExecutionReport",
  "readOnboarding",
  "completeOnboarding",
  "readLock",
  "readConfig",
  "configSummary",
] as const satisfies readonly (keyof DataProvider)[];

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
  if (problems.length) {
    throw new Error(`Data provider "${name}" does not satisfy DataProvider: ${problems.join(", ")}`);
  }
  return provider as DataProvider;
}
