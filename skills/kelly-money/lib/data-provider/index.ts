// Data-provider selector for kelly-money.
//
// kelly-money is a read-mostly financial dashboard. Its unit of state — a ledger
// snapshot (accounts / transactions / invoices / matches) plus onboarding + lock
// — is served either from local JSON files or from a Busabase base:
//
//   KELLY_MONEY_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_MONEY_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider surface (getState + getSnapshot /
// getOnboarding / getLock / getConfigSummary), so the Hono server and scripts
// are backend-agnostic. This module also owns config + dotenv loading so callers
// get a fully-resolved provider from a single createProvider() call.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export { ensureDirs } from "./local-file-provider.ts";

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
  if (process.env.KELLY_MONEY_CONFIG) paths.push(process.env.KELLY_MONEY_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_MONEY_ENV_FILE) paths.push(process.env.KELLY_MONEY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", ".env"));
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

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_MONEY_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const configResult = await readConfig();
  const meta: ProviderMeta = {
    config: configResult.config,
    config_path: configResult.path,
    is_example: configResult.is_example,
  };
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_MONEY_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
