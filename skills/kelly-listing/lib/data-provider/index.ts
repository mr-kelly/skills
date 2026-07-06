// Data-provider selector for kelly-listing.
//
// kelly-listing is an App-in-Skill whose unit of work — a listing draft under
// review-before-export — maps onto Busabase's review model (record +
// change_request + operation + review + merge). This module lets the same UI
// and scripts run against either backend:
//
//   KELLY_LISTING_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_LISTING_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts).

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

function configCandidates() {
  return [
    process.env.KELLY_LISTING_CONFIG,
    path.join(SKILL_DIR, "config.local.json"),
    path.join(process.env.HOME || "", ".config", "kelly-listing", "config.json"),
    path.join(SKILL_DIR, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8"));
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: {}, source: null, is_example: false };
}

export function resolveProviderKind(config: Record<string, unknown> = {}) {
  return String(process.env.KELLY_LISTING_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_LISTING_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
