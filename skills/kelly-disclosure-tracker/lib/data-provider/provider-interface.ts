// Provider contract for kelly-disclosure-tracker. The app server and scripts
// depend on this interface, not on node:fs directly, so the same UI logic can run
// against a local-file store today and a shared/cloud store later without a
// rewrite (see the Data Provider Spectrum in app-in-skill-creator/SKILL.md).

import type { Batch, Config, ConfigResult, Decision, DecisionsFile } from "../../app/server/types.ts";

export interface DataProvider {
  name: string;
  readBatch(): Promise<Batch>;
  readDecisions(): Promise<DecisionsFile>;
  recordDecision(itemId: string, decision: Decision): Promise<Batch>;
  readConfig(): Promise<ConfigResult>;
}

export const CORE_METHODS: Array<keyof DataProvider> = ["readBatch", "readDecisions", "recordDecision", "readConfig"];

export function assertProvider(name: string, provider: Partial<DataProvider>): asserts provider is DataProvider {
  for (const method of CORE_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new Error(`data-provider "${name}" is missing required method "${String(method)}"`);
    }
  }
}
