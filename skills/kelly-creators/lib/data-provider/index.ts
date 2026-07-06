// Data-provider selector for kelly-creators.
//
// kelly-creators is an App-in-Skill whose unit of work — a creator engagement
// under review-before-outreach — maps cleanly onto Busabase's review model
// (record + change_request + operation + review + merge). This module lets the
// same UI and scripts run against either backend:
//
//   KELLY_CREATORS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_CREATORS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface; assertProvider() is the
// runtime guard that fails loudly at registration if a provider drifts.

import { readConfig } from "../config.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { assertProvider } from "./provider-interface.ts";

export { assertProvider } from "./provider-interface.ts";
export type { DataProvider } from "./provider-interface.ts";

// Workflow statuses are shared across providers. Busabase maps its change-request
// status onto these so the UI renders identically in either mode.
export const WORKFLOW_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_CREATORS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider() {
  const configResult = await readConfig();
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(configResult));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(configResult));
  throw new Error(`Unknown KELLY_CREATORS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
