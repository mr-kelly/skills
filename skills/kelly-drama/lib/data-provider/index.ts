// Data-provider selector for kelly-drama.
//
// kelly-drama is a workspace-style media studio whose store surface — one
// project document, config blobs, an active pointer, a write lock, and generated
// media — maps onto either a local .data/ tree or a Busabase base. This module
// lets the same server, services, and scripts run against either backend:
//
//   KELLY_DRAMA_DATA_PROVIDER=local     (default) JSON + media under app/.data/
//   KELLY_DRAMA_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DramaProvider interface (see provider-interface.ts).

import fs from "node:fs/promises";
import { CONFIG_EXAMPLE_PATH, CONFIG_LOCAL_PATH } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DramaProvider, assertProvider } from "./provider-interface.ts";

function configCandidates() {
  return [process.env.KELLY_DRAMA_CONFIG, CONFIG_LOCAL_PATH, CONFIG_EXAMPLE_PATH].filter(Boolean) as string[];
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

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_DRAMA_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DramaProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_DRAMA_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
