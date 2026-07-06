// Data-provider selector for kelly-family-fund.
//
// kelly-family-fund is a read-mostly pooled-pension / elder-care ledger. This
// module lets the same dashboard and scripts run against either backend:
//
//   KELLY_FAMILY_FUND_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_FAMILY_FUND_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same FundProvider interface, so hono.ts and the scripts
// call createProvider() once and use provider.* without knowing the backend.

import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, FundProvider, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { assertProvider } from "./provider-interface.ts";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_FAMILY_FUND_CONFIG) paths.push(process.env.KELLY_FAMILY_FUND_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-fund", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_FAMILY_FUND_ENV_FILE) paths.push(process.env.KELLY_FAMILY_FUND_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-fund", ".env"));
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

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Load config from the first candidate that exists, into ProviderMeta shape. */
export async function loadConfig(): Promise<ProviderMeta> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config | null>(file, null);
    if (config) {
      return { config, source: file, is_example: file.endsWith("config.example.json") };
    }
  }
  return { config: { beneficiaries: [], families: [] }, source: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_FAMILY_FUND_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<FundProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  let provider: FundProvider;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_FAMILY_FUND_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  return assertProvider(kind, provider);
}

/** Config-only accessor for scripts that need config without a provider. */
export async function loadConfigResult(): Promise<ConfigResult> {
  const meta = await loadConfig();
  return {
    config: (meta.config as Config) || { beneficiaries: [], families: [] },
    path: meta.source || "",
    is_example: Boolean(meta.is_example),
  };
}
