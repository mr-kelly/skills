// Data-provider selector for kelly-launch.
//
// kelly-launch is an App-in-Skill whose unit of work — a launch checklist item
// under review-before-ship — maps onto Busabase's review model (record +
// change_request + operation + commit + review + merge). This module lets the
// same UI and scripts run against either backend:
//
//   KELLY_LAUNCH_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_LAUNCH_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts).

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Config discovery mirrors the original store.ts configSearchPaths() exactly, so
// the same config.local.json / ~/.config / config.example.json cascade applies.
function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_LAUNCH_CONFIG) paths.push(process.env.KELLY_LAUNCH_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

async function readJson(file: string): Promise<Config | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file);
    if (config) return { config, source: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { channels: [] }, source: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_LAUNCH_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider(kind, createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider(kind, createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_LAUNCH_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
