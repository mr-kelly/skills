import fs from "node:fs/promises";
import { nowIso, readJson, writeJson } from "../common.ts";
import { AGENTS_PATH, DATA_DIR, LOCK_PATH, ONBOARDING_PATH, configSearchPaths } from "../paths.ts";
import type { AgentsFile, Config, ConfigResult, DataProvider, Onboarding } from "./provider-interface.ts";

function emptyAgentsFile(): AgentsFile {
  return { schema_version: "1", generated_at: nowIso(), agents: [] };
}

export class LocalFileProvider implements DataProvider {
  name = "local";

  async readAgentsFile(): Promise<AgentsFile> {
    return (await readJson<AgentsFile>(AGENTS_PATH, emptyAgentsFile())) as AgentsFile;
  }

  async writeAgentsFile(file: AgentsFile): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeJson(AGENTS_PATH, { ...file, generated_at: nowIso() });
  }

  async readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async writeOnboarding(onboarding: Onboarding): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeJson(ONBOARDING_PATH, onboarding);
  }

  async readConfig(): Promise<ConfigResult> {
    for (const file of configSearchPaths()) {
      const config = await readJson<Config>(file, null);
      if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
    }
    return { config: {}, path: "", is_example: false };
  }

  async readLock(): Promise<unknown> {
    return readJson(LOCK_PATH, null);
  }
}
