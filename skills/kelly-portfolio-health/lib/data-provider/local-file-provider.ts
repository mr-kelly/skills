import { ensureDirs, readJson, writeJson } from "../common.ts";
import { DECISIONS_PATH, LOCK_PATH, ONBOARDING_PATH, SNAPSHOT_PATH, configSearchPaths } from "../paths.ts";
import type {
  Config,
  ConfigResult,
  DataProvider,
  DecisionsMap,
  FlagDecision,
  Onboarding,
} from "./provider-interface.ts";

// Default provider: everything lives in local JSON files under app/.data/.
// Single operator, offline, fastest start — no sharing, no remote access.
// Swapping to `postgres`/`aitable`/`notion`/`busabase` later is a config
// change, not a rewrite, as long as it implements DataProvider identically.
export class LocalFileProvider implements DataProvider {
  name = "local";

  async readSnapshot<T = unknown>(): Promise<T> {
    return (await readJson<T>(SNAPSHOT_PATH, null)) as T;
  }

  async readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async readConfig(): Promise<ConfigResult> {
    for (const file of configSearchPaths()) {
      const config = await readJson<Config>(file, null);
      if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
    }
    return { config: {}, path: "", is_example: false };
  }

  async readDecisions(): Promise<DecisionsMap> {
    return (await readJson<DecisionsMap>(DECISIONS_PATH, {})) as DecisionsMap;
  }

  async setDecision(contractId: string, patch: Partial<FlagDecision>): Promise<FlagDecision> {
    await ensureDirs();
    const decisions = await this.readDecisions();
    const previous = decisions[contractId] || { flagged: false, note: "", updated_at: "" };
    const next: FlagDecision = {
      flagged: patch.flagged ?? previous.flagged,
      note: patch.note ?? previous.note,
      updated_at: new Date().toISOString(),
    };
    decisions[contractId] = next;
    await writeJson(DECISIONS_PATH, decisions);
    return next;
  }

  async readLock(): Promise<unknown> {
    return readJson(LOCK_PATH, null);
  }
}
