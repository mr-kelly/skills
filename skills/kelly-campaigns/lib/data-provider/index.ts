// Data-provider selector for kelly-campaigns.
//
// kelly-campaigns is an App-in-Skill whose unit of work — an outbound send under
// review-before-schedule — maps cleanly onto Busabase's review model. This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_CAMPAIGNS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_CAMPAIGNS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider surface (see provider-interface.ts), so
// switching backends is a config change, not a rewrite. assertProvider() runs at
// registration so a non-conforming provider fails loud here, not deep in a request.

import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { loadConfig } from "./config.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export { loadConfig } from "./config.ts";
export { emptySnapshot } from "./local-file-provider.ts";

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_CAMPAIGNS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_CAMPAIGNS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
