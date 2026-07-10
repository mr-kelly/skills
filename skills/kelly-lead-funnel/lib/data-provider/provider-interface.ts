// Provider contract for the Deal Sourcing Funnel. "Provider" (not "reader")
// because the same interface both reads pipeline state and writes human
// decisions (stage moves, rejections, notes). local-file-provider.ts is the
// only implementation today; future providers (postgres, aitable, notion,
// busabase) must implement the same shape so the app/scripts never change.

import type { Lock } from "../common.ts";
import type { Config, ConfigResult, Lead, Stage } from "../types.ts";

export interface DataProvider {
  readonly name: string;
  getLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | undefined>;
  saveLeads(leads: Lead[]): Promise<void>;
  moveStage(id: string, stage: Stage, reason?: string): Promise<Lead | undefined>;
  addNote(id: string, text: string, author?: string): Promise<Lead | undefined>;
  getOnboarding(): Promise<{ completed: boolean; completed_at?: string; config_version?: string }>;
  getConfig(): Promise<ConfigResult>;
  getLock(): Promise<Lock | null>;
}

export const CORE_METHODS: (keyof DataProvider)[] = [
  "getLeads",
  "getLead",
  "saveLeads",
  "moveStage",
  "addNote",
  "getOnboarding",
  "getConfig",
  "getLock",
];

export function assertProvider(name: string, provider: Partial<DataProvider>): asserts provider is DataProvider {
  for (const method of CORE_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new Error(`Data provider "${name}" is missing required method "${String(method)}"`);
    }
  }
}

export type { Config };
