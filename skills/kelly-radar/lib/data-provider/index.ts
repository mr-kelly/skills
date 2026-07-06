// Data-provider selector for kelly-radar.
//
// kelly-radar is an App-in-Skill review desk over three workflows — competitor
// monitoring (signals), a research workbench with brief approval, and trend
// tracking. Its unit of work — an item under triage-before-handoff — maps onto
// Busabase's review model (record + change_request + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_RADAR_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_RADAR_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same RadarProvider interface; assertProvider() fails loud at
// registration if a provider drifts from the contract.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type RadarProvider, assertProvider } from "./provider-interface.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_RADAR_CONFIG) paths.push(process.env.KELLY_RADAR_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-radar", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_RADAR_ENV_FILE) paths.push(process.env.KELLY_RADAR_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-radar", ".env"));
  return paths;
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function loadConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { watchlist: [] }, path: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_RADAR_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<RadarProvider> {
  await loadDotenvFiles(envSearchPaths());
  const configResult = await loadConfig();
  const meta: ProviderMeta = {
    config: configResult.config,
    source: configResult.path,
    is_example: configResult.is_example,
    configResult,
  };
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_RADAR_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
