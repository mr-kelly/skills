// Data-provider selector for kelly-ads.
//
// kelly-ads is an App-in-Skill whose unit of work — an ads adjustment card under
// review-before-execute — maps cleanly onto Busabase's review model
// (record + change_request + review + merge). This module lets the same UI and
// scripts run against either backend:
//
//   KELLY_ADS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_ADS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts).
// createProvider() picks by env or config.data_provider (default "local"), throws
// on an unknown kind, and asserts conformance at registration so a broken
// provider fails loudly here instead of mid-request.

import { readConfig } from "../common.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_ADS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const configResult = await readConfig();
  const meta = { config: configResult.config, source: configResult.path, is_example: configResult.is_example };
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_ADS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}

// Re-export the provider-neutral config/dotenv/math helpers the scripts call
// alongside provider state ops.
export {
  configSearchPaths,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  pushSyncLog,
  readConfig,
  readJson,
  recomputeDerived,
  round1,
  round2,
  summarizeConfig,
  totalsForDays,
  writeJson,
} from "../common.ts";

export type { DataProvider } from "./provider-interface.ts";
