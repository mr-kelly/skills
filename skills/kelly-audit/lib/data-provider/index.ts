// Data-provider selector for kelly-audit.
//
// kelly-audit is an App-in-Skill whose unit of work — an audit anomaly under
// review-before-execute — maps cleanly onto Busabase's review model
// (record + change_request + operation + commit + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_AUDIT_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_AUDIT_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// The name is resolved from KELLY_AUDIT_DATA_PROVIDER, else config.data_provider,
// else "local". Every provider is validated with assertProvider() at registration
// so a non-conforming backend fails loudly here rather than mid-request.

import { readConfig } from "../audit-core.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_AUDIT_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

async function loadMeta(): Promise<ProviderMeta> {
  const result = await readConfig();
  return { config: result.config, source: result.path || null, is_example: result.is_example };
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadMeta();
  const kind = resolveProviderKind(meta.config);
  let provider: DataProvider;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_AUDIT_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  return assertProvider(kind, provider);
}
