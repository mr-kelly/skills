import fs from "node:fs/promises";
import type { Onboarding, ScenarioBatch } from "../../app/server/types.ts";
import { type ConfigResult, readConfig, readJson, writeJson } from "../common.ts";
import { LOCK_PATH, ONBOARDING_PATH, SCENARIOS_PATH } from "../paths.ts";
import type { DataProvider } from "./provider-interface.ts";

export function emptyBatch(): ScenarioBatch {
  return {
    batch_id: "empty",
    generated_at: new Date(0).toISOString(),
    source: "kelly-revshare-simulator",
    mode: "app-in-skill",
    metrics: { total: 0, approved: 0, needs_revision: 0, rejected: 0, undecided: 0 },
    scenarios: [],
  };
}

export class LocalFileProvider implements DataProvider {
  name = "local";

  async readBatch(): Promise<ScenarioBatch> {
    return (await readJson<ScenarioBatch>(SCENARIOS_PATH, emptyBatch())) as ScenarioBatch;
  }

  async writeBatch(batch: ScenarioBatch): Promise<void> {
    await writeJson(SCENARIOS_PATH, batch);
  }

  async readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async writeOnboarding(onboarding: Onboarding): Promise<void> {
    await writeJson(ONBOARDING_PATH, onboarding);
  }

  async readConfig(): Promise<ConfigResult> {
    return readConfig();
  }

  async readLock(): Promise<unknown> {
    return readJson(LOCK_PATH, null);
  }
}
