// Contract every data provider MUST implement. The app/server and scripts
// depend only on this interface, never on a concrete provider or on
// node:fs directly, so the backing store (local files today; a database or
// Busabase later) is a config change, not a rewrite.

import type { Onboarding, Scenario, ScenarioBatch } from "../../app/server/types.ts";
import type { ConfigResult } from "../common.ts";

export interface DataProvider {
  name: string;
  readBatch(): Promise<ScenarioBatch>;
  writeBatch(batch: ScenarioBatch): Promise<void>;
  readOnboarding(): Promise<Onboarding>;
  writeOnboarding(onboarding: Onboarding): Promise<void>;
  readConfig(): Promise<ConfigResult>;
  readLock(): Promise<unknown>;
}

// Members every provider MUST implement (checked at registration so a
// missing/mismatched method fails loud instead of surfacing later as
// "provider.getX is not a function").
export const CORE_METHODS: (keyof DataProvider)[] = [
  "readBatch",
  "writeBatch",
  "readOnboarding",
  "writeOnboarding",
  "readConfig",
  "readLock",
];

export function assertProvider(name: string, provider: Partial<DataProvider>): asserts provider is DataProvider {
  for (const method of CORE_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new Error(`Data provider "${name}" is missing required member "${String(method)}"`);
    }
  }
}
