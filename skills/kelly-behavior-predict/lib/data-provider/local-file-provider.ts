import { readJson, writeJson } from "../common.ts";
import { type Dataset, buildDataset } from "../dataset.ts";
import {
  CONFIG_EXAMPLE_PATH,
  CONFIG_LOCAL_PATH,
  DATASET_PATH,
  DECISIONS_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
} from "../paths.ts";
import { DEFAULT_DATASET_SEED } from "../sessions.ts";
import type { Decision, DecisionsFile, OnboardingState } from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

// Default provider: local JSON files under app/.data/ plus config.local.json
// (falling back to config.example.json as a template-only default). No
// network access, no external side effects — the app reads/writes local
// files only, matching the App-in-Skill boundary.

export class LocalFileProvider implements DataProvider {
  name = "local";

  async getDataset(): Promise<Dataset> {
    // Prefer the file written by scripts/generate_batch.ts; fall back to
    // building it in-memory from the same fixed seed so the app always has
    // data even before the seed script has run.
    const fromFile = await readJson<Dataset>(DATASET_PATH, null);
    if (fromFile) return fromFile;
    return buildDataset(DEFAULT_DATASET_SEED);
  }

  async getDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, {})) as DecisionsFile;
  }

  async saveDecision(segmentId: string, decision: Decision): Promise<DecisionsFile> {
    const decisions = await this.getDecisions();
    decisions[segmentId] = decision;
    await writeJson(DECISIONS_PATH, decisions);
    return decisions;
  }

  async getOnboarding(): Promise<OnboardingState> {
    return (await readJson<OnboardingState>(ONBOARDING_PATH, { completed: false })) as OnboardingState;
  }

  async getLock(): Promise<unknown> {
    return readJson(LOCK_PATH, null);
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const local = await readJson<Record<string, unknown>>(CONFIG_LOCAL_PATH, null);
    if (local) return local;
    return (await readJson<Record<string, unknown>>(CONFIG_EXAMPLE_PATH, {})) as Record<string, unknown>;
  }
}
