import type { AgentTasksFile, ConfigResult, DecisionsFile, ExecutionReport, Snapshot } from "../types.ts";

export interface DecisionPayload {
  id?: string;
  action?: string;
  comment?: string;
  draft?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AppState {
  app: string;
  data_provider: string;
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: Record<string, unknown>;
  decisions: DecisionsFile;
  agent_tasks: AgentTasksFile;
  execution_report: ExecutionReport | null;
  snapshot: Snapshot;
  [key: string]: unknown;
}

export interface DataProvider {
  readonly kind: string;
  getState(): Promise<AppState>;
  applyDecision(payload: DecisionPayload): Promise<DecisionsFile>;
  readLock(): Promise<Record<string, unknown> | null>;
  readConfig(): Promise<ConfigResult>;
  readSnapshot(): Promise<Snapshot>;
  writeSnapshot(snapshot: Snapshot): Promise<void>;
  readDecisions(): Promise<DecisionsFile>;
  readAgentTasks(): Promise<AgentTasksFile>;
  writeAgentTasks(tasks: AgentTasksFile): Promise<void>;
  readExecutionReport(): Promise<ExecutionReport | null>;
  writeExecutionReport(report: ExecutionReport): Promise<void>;
  completeOnboarding(marker?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export const CORE_METHODS = [
  "getState",
  "applyDecision",
  "readLock",
  "readConfig",
  "readSnapshot",
  "writeSnapshot",
  "readDecisions",
  "readAgentTasks",
  "writeAgentTasks",
  "readExecutionReport",
  "writeExecutionReport",
  "completeOnboarding",
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
    throw new Error(`Data provider "${name}" does not satisfy DataProvider — missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as DataProvider;
}
