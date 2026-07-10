// Domain types + the DataProvider contract shared by every backing store
// (local files today; postgres/aitable/notion/busabase reserved for later).
// app/server/types.ts re-exports these so server code has one import path.

export type AgentStatus = "draft" | "live" | "paused" | "archived";

export interface AgentConfig {
  id: string;
  name: string;
  trigger_description: string;
  allowed_tools: string[];
  approval_required: boolean;
  monthly_quota: number;
  calls_this_month: number;
  owning_team: string;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
}

export interface AgentsFile {
  schema_version: string;
  generated_at: string;
  agents: AgentConfig[];
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Config {
  default_port?: number;
  ui?: { language?: string };
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface DataProvider {
  name: string;
  readAgentsFile(): Promise<AgentsFile>;
  writeAgentsFile(file: AgentsFile): Promise<void>;
  readOnboarding(): Promise<Onboarding>;
  writeOnboarding(onboarding: Onboarding): Promise<void>;
  readConfig(): Promise<ConfigResult>;
  readLock(): Promise<unknown>;
}

export const CORE_METHODS: Array<keyof DataProvider> = [
  "readAgentsFile",
  "writeAgentsFile",
  "readOnboarding",
  "writeOnboarding",
  "readConfig",
  "readLock",
];

export function assertProvider(name: string, provider: Partial<DataProvider>): DataProvider {
  const missing = CORE_METHODS.filter((method) => typeof provider[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`data provider "${name}" is missing required member(s): ${missing.join(", ")}`);
  }
  return provider as DataProvider;
}
