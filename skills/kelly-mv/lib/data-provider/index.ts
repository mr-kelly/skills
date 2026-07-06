// Data-provider selector for kelly-mv.
//
// kelly-mv is an App-in-Skill whose unit of work — a music-video project (song,
// treatment, characters, shots, tasks) plus its generated media — can run
// against either backend:
//
//   KELLY_MV_DATA_PROVIDER=local     (default) JSON files + media in app/.data/
//   KELLY_MV_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same MvDataProvider interface, so the Hono app, services,
// and scripts get one provider from createProvider() and never touch node:fs or
// a backend SDK directly. assertProvider() is the runtime guard that fails loud
// at registration if a provider drifts from the interface.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type MvDataProvider, assertProvider } from "./provider-interface.ts";

function configCandidates() {
  return [
    process.env.KELLY_MV_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-mv", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig() {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8")) as Config;
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: {} as Config, source: null, is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_MV_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<MvDataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_MV_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
