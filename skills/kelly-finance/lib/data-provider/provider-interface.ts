import type { AgentTasksFile, DecisionsFile, FinanceSnapshot, LockRecord, Onboarding } from "../types.ts";

export interface ReviewInput {
  id?: string;
  action?: "approve" | "request_changes" | "revise" | "block" | "dismiss";
  comment?: string;
  draft?: string;
}

export interface DataProvider {
  readonly name: string;
  ensureReady(): Promise<void>;
  readSnapshot(): Promise<FinanceSnapshot>;
  writeSnapshot(snapshot: FinanceSnapshot): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readExecutionReport(): Promise<Record<string, unknown> | null>;
  readOnboarding(): Promise<Onboarding>;
  readLock(): Promise<LockRecord | null>;
  applyDecision(input: ReviewInput): Promise<FinanceSnapshot>;
  completeOnboarding(marker?: Onboarding): Promise<Onboarding>;
  acquireLock(lock: LockRecord): Promise<void>;
  releaseLock(): Promise<void>;
  getConfigSummary(): Promise<Record<string, unknown>>;
}

export const CORE_METHODS = [
  "ensureReady",
  "readSnapshot",
  "writeSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "readLock",
  "applyDecision",
  "completeOnboarding",
  "acquireLock",
  "releaseLock",
  "getConfigSummary",
] as const satisfies readonly (keyof DataProvider)[];

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
    throw new Error(`Data provider "${name}" does not satisfy DataProvider: ${problems.join(", ")}`);
  }
  return provider as DataProvider;
}
