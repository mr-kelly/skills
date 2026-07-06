// Data-provider selector for kelly-picks.
//
// kelly-picks is an App-in-Skill whose unit of work — a product-research radar
// snapshot under develop/watch/drop review — runs against either backend:
//
//   KELLY_PICKS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_PICKS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts), so
// the Hono server and the scripts get a provider from createProvider() and use it
// without knowing the backend. assertProvider() is the runtime backstop: a
// non-conforming provider fails loudly at startup, not mid-request.

import { readConfig } from "../config.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { assertProvider, type DataProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_PICKS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await readConfig();
  const kind = resolveProviderKind(meta.config);
  const providerMeta = { config: meta.config, source: meta.path, is_example: meta.is_example };
  if (kind === "local") return assertProvider("local", createLocalFileProvider(providerMeta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(providerMeta));
  throw new Error(`Unknown KELLY_PICKS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}

export { assertProvider, type DataProvider } from "./provider-interface.ts";
