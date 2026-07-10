// Contract every data provider must implement. "Provider" (not "reader")
// because the same interface both reads portfolio state and writes the human
// review action (flag / clear / note) — it may be backed by local files today
// and a database or cloud service (e.g. Busabase) later without changing the
// app or scripts that consume it.

export interface Config {
  base_currency?: string;
  data_provider?: string;
  fund_name?: string;
  risk_policy?: {
    lag_watch_pp?: number;
    lag_high_pp?: number;
    revenue_decline_pct?: number;
  };
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface FlagDecision {
  flagged: boolean;
  note: string;
  updated_at: string;
}

export type DecisionsMap = Record<string, FlagDecision>;

export interface DataProvider {
  name: string;
  readSnapshot<T = unknown>(): Promise<T>;
  readOnboarding(): Promise<Onboarding>;
  readConfig(): Promise<ConfigResult>;
  readDecisions(): Promise<DecisionsMap>;
  setDecision(contractId: string, patch: Partial<FlagDecision>): Promise<FlagDecision>;
  readLock(): Promise<unknown>;
}

// Core members every provider MUST implement; used by the consistency guard
// so a mismatched/incomplete provider fails loudly at registration instead of
// with a confusing "provider.getX is not a function" deep in a request.
export const CORE_METHODS: (keyof DataProvider)[] = [
  "readSnapshot",
  "readOnboarding",
  "readConfig",
  "readDecisions",
  "setDecision",
  "readLock",
];

export function assertProvider(name: string, provider: Partial<DataProvider>): asserts provider is DataProvider {
  const missing = CORE_METHODS.filter((method) => typeof provider[method] !== "function");
  if (missing.length) {
    throw new Error(`Data provider "${name}" is missing required member(s): ${missing.join(", ")}`);
  }
}
