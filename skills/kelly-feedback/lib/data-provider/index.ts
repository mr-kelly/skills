// Data-provider selector for kelly-feedback.
//
// kelly-feedback is an App-in-Skill whose unit of work — a roadmap proposal
// under review-before-execute — maps cleanly onto Busabase's review model
// (record + change_request + review + merge). This module lets the same UI and
// scripts run against either backend:
//
//   KELLY_FEEDBACK_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_FEEDBACK_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same ReviewProvider interface (review vocabulary); see
// provider-interface.ts.

import { readConfig } from "../common.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type ReviewProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_FEEDBACK_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<ReviewProvider> {
  const configResult = await readConfig();
  const meta: ProviderMeta = {
    config: configResult.config,
    source: configResult.path || null,
    is_example: configResult.is_example,
  };
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_FEEDBACK_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
