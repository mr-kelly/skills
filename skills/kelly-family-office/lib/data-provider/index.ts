// Data-provider selector for kelly-family-office.
//
// kelly-family-office is a read-mostly consolidation dashboard whose unit of
// state is one authoritative snapshot plus config/onboarding/lock context. This
// module lets the same UI and scripts run against either backend:
//
//   KELLY_FAMILY_OFFICE_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_FAMILY_OFFICE_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts).
// createProvider() resolves the kind from the env var (env wins over config),
// defaults to "local", throws on anything else, and runs the provider through
// assertProvider() so a non-conforming provider fails loudly at registration.

import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

function configCandidates(): string[] {
  return [
    process.env.KELLY_FAMILY_OFFICE_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(process.env.HOME || "", ".config", "kelly-family-office", "config.json"),
    path.join(skillDir, "config.example.json"),
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
  return String(process.env.KELLY_FAMILY_OFFICE_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider(kind, createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider(kind, createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_FAMILY_OFFICE_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
