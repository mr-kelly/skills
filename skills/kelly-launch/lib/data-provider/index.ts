// Data-provider selector for kelly-launch.
//
// kelly-launch is an App-in-Skill whose unit of work — a launch item under
// review-before-ship — maps cleanly onto Busabase's review model
// (record + change_request + operation + commit + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_LAUNCH_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_LAUNCH_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface. assertProvider() runs at
// registration so a non-conforming provider fails loudly instead of mid-request.

import { readConfig } from "../common.ts";
import type { Config, ConfigResult } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

// Alias kept for parity with the other skills' provider modules.
export async function loadConfig(): Promise<ConfigResult> {
  return readConfig();
}

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_LAUNCH_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const result = await loadConfig();
  const meta = { config: result.config, source: result.path || null, is_example: result.is_example };
  const kind = resolveProviderKind(result.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_LAUNCH_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
