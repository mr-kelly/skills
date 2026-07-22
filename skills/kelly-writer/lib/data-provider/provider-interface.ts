export interface ReviewProvider {
  name: string;
  kind: string;
  getState: (...args: unknown[]) => Promise<unknown>;
  saveDecision: (...args: unknown[]) => Promise<unknown>;
  confirmDirection: (...args: unknown[]) => Promise<unknown>;
  startTodo: (...args: unknown[]) => Promise<unknown>;
  putBatch: (...args: unknown[]) => Promise<unknown>;
  exportApproved: (...args: unknown[]) => Promise<unknown>;
  listAgentTasks: (...args: unknown[]) => Promise<unknown>;
  configSummary: (...args: unknown[]) => Record<string, unknown>;
}

const CORE_METHODS = [
  "getState",
  "saveDecision",
  "confirmDirection",
  "startTodo",
  "putBatch",
  "exportApproved",
  "listAgentTasks",
  "configSummary",
] as const;

export function assertProvider<T>(name: string, provider: T): T {
  if (!provider || typeof provider !== "object") {
    throw new Error(`data provider "${name}" must be an object`);
  }
  const candidate = provider as Record<string, unknown>;
  const missing = CORE_METHODS.filter((method) => typeof candidate[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`data provider "${name}" is missing required member(s): ${missing.join(", ")}`);
  }
  if (candidate.name !== name || candidate.kind !== name) {
    throw new Error(`data provider "${name}" must expose matching name and kind values`);
  }
  return provider;
}
