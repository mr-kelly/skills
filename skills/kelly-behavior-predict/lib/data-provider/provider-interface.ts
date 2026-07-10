// Contract every data provider MUST implement. The app server and scripts
// depend on this interface, not on local JSON reads directly, so a future
// provider (e.g. busabase) is a config change, not a rewrite.

import type { Dataset } from "../dataset.ts";
import type { Decision, DecisionsFile, OnboardingState } from "../types.ts";

export interface DataProvider {
  name: string;
  getDataset(): Promise<Dataset>;
  getDecisions(): Promise<DecisionsFile>;
  saveDecision(segmentId: string, decision: Decision): Promise<DecisionsFile>;
  getOnboarding(): Promise<OnboardingState>;
  getLock(): Promise<unknown>;
  getConfig(): Promise<Record<string, unknown>>;
}

// Members every provider must expose. Kept as a plain string list (not just
// the TS interface) so `assertProvider` can fail loudly at runtime too, for
// any dynamic/JS caller that bypasses the compiler.
export const CORE_METHODS: (keyof DataProvider)[] = [
  "getDataset",
  "getDecisions",
  "saveDecision",
  "getOnboarding",
  "getLock",
  "getConfig",
];

export function assertProvider(name: string, provider: Partial<DataProvider>): asserts provider is DataProvider {
  const missing = CORE_METHODS.filter((method) => typeof provider[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`Data provider "${name}" is missing required member(s): ${missing.join(", ")}`);
  }
}
