import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type PptFactoryProvider, assertProvider } from "./provider-interface.ts";

function configCandidates(): string[] {
  return [
    process.env.KELLY_PPT_FACTORY_CONFIG,
    path.join(SKILL_DIR, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-ppt-factory", "config.json"),
    path.join(SKILL_DIR, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8")) as Config;
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: {}, source: null, is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_PPT_FACTORY_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<PptFactoryProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  throw new Error(`Unknown KELLY_PPT_FACTORY_DATA_PROVIDER: "${kind}" (expected "local")`);
}
