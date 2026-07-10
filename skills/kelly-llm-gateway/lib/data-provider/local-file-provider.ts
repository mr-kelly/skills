// Default `local` data provider: reads/writes the local handoff files under
// app/.data/. Delegates to the same modules the Hono app uses (app/server/
// store.ts, decisions.ts) so the UI and any future script/agent path stay in
// sync. Reserve provider names `postgres`, `aitable`, `notion`, `busabase` for
// later cloud-backed implementations — see app-in-skill-creator SKILL.md's
// Data Provider Spectrum.

import { recordAnomalyAck, recordRolloutDecision } from "../../app/server/decisions.ts";
import {
  readConfig,
  readDecisions,
  readLock,
  readOnboarding,
  readSnapshot,
  summarizeConfig,
} from "../../app/server/store.ts";
import type { Decisions, GatewaySnapshot, RolloutAction } from "../../app/server/types.ts";
import type { DataProvider } from "./provider-interface.ts";

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async getSnapshot(): Promise<GatewaySnapshot> {
    return readSnapshot();
  }

  async getDecisions(): Promise<Decisions> {
    return readDecisions();
  }

  async recordRolloutDecision(routeId: string, action: RolloutAction, note: string): Promise<Decisions> {
    return recordRolloutDecision(routeId, action, note);
  }

  async recordAnomalyAck(anomalyId: string, note: string): Promise<Decisions> {
    return recordAnomalyAck(anomalyId, note);
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    const configResult = await readConfig();
    return summarizeConfig(configResult) as unknown as Record<string, unknown>;
  }

  async getLock(): Promise<unknown> {
    return readLock();
  }

  async getOnboarding(): Promise<Record<string, unknown>> {
    return (await readOnboarding()) as unknown as Record<string, unknown>;
  }
}

export const localFileProvider = new LocalFileProvider();
