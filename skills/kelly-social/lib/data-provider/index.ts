// Data-provider selector for kelly-social.
//
// kelly-social is a read-mostly social monitoring dashboard. This module lets the
// same UI and scripts run against either backend:
//
//   KELLY_SOCIAL_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_SOCIAL_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts):
//   getState()          -> { data_provider, onboarding, lock, config_summary, snapshot }
//   getSnapshot()       -> normalized SocialSnapshot
//   getOnboarding()     -> onboarding marker
//   getLock()           -> write-lock status (null when unlocked)
//   getConfigSummary()  -> sanitized setup summary (never secrets)

import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

function configCandidates() {
  return [
    process.env.KELLY_SOCIAL_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(process.env.HOME || "", ".config", "kelly-social", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean) as string[];
}

export async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8"));
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: { accounts: [] }, source: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_SOCIAL_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_SOCIAL_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
