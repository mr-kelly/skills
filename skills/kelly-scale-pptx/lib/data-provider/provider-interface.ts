import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  ScalePptxSnapshot,
  ScalePptxState,
} from "../types.ts";

export interface ScalePptxProvider {
  readonly kind: string;
  getState(): Promise<ScalePptxState>;
  applyDecision(payload?: DecisionBody): Promise<DecisionsFile>;
  configSummary(): ConfigSummary;
  readConfig(): Promise<ConfigResult>;
  readSnapshot(): Promise<ScalePptxSnapshot>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  readOnboarding(): Promise<Onboarding>;
  readLock(): Promise<Lock | null>;
  writeSnapshot(snapshot: ScalePptxSnapshot): Promise<void>;
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
] as const satisfies readonly (keyof ScalePptxProvider)[];

export function assertProvider(name: string, provider: unknown): ScalePptxProvider {
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
      `Data provider "${name}" does not satisfy ScalePptxProvider - missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as ScalePptxProvider;
}
