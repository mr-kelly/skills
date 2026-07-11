import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  PptFactorySnapshot,
  PptFactoryState,
} from "../types.ts";

export interface PptFactoryProvider {
  readonly kind: string;
  getState(): Promise<PptFactoryState>;
  applyDecision(payload?: DecisionBody): Promise<DecisionsFile>;
  configSummary(): ConfigSummary;
  readConfig(): Promise<ConfigResult>;
  readSnapshot(): Promise<PptFactorySnapshot>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  readOnboarding(): Promise<Onboarding>;
  readLock(): Promise<Lock | null>;
  writeSnapshot(snapshot: PptFactorySnapshot): Promise<void>;
  writeDecisions(decisions: DecisionsFile): Promise<void>;
  writeAgentTasks(tasks: AgentTasksFile): Promise<void>;
  writeExecutionReport(report: ExecutionReport): Promise<void>;
}

export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "configSummary",
  "readConfig",
  "readSnapshot",
  "readDecisions",
  "readAgentTasks",
  "readExecutionReport",
  "readOnboarding",
  "readLock",
  "writeSnapshot",
  "writeDecisions",
  "writeAgentTasks",
  "writeExecutionReport",
] as const satisfies readonly (keyof PptFactoryProvider)[];

export function assertProvider(name: string, provider: unknown): PptFactoryProvider {
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
    throw new Error(
      `Data provider "${name}" does not satisfy PptFactoryProvider - missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as PptFactoryProvider;
}
