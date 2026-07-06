// Data-provider selector for kelly-standup.
//
// kelly-standup is an App-in-Skill whose unit of human review — an
// approval-gated nudge (reminder) — maps onto Busabase's review model
// (record + change_request + review). This module lets the same Hono server and
// the same scripts run against either backend:
//
//   KELLY_STANDUP_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_STANDUP_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see ./provider-interface.ts).

import { readConfig } from "../common.ts";
import type { ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: { data_provider?: string } = {}) {
  return String(process.env.KELLY_STANDUP_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const configResult = await readConfig();
  const meta: ProviderMeta = {
    config: configResult.config,
    source: configResult.path,
    is_example: configResult.is_example,
    configResult,
  };
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider(kind, createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider(kind, createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_STANDUP_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
