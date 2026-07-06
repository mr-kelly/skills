// Data-provider selector for kelly-devops.
//
// kelly-devops is an App-in-Skill whose unit of work — an ops action card under
// human review — maps cleanly onto Busabase's review model (change_request +
// review + merge). This module lets the same UI and scripts run against either
// backend:
//
//   KELLY_DEVOPS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_DEVOPS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (see provider-interface.ts):
//   getState()                   -> aggregate /api/state payload
//   getSnapshot() / saveSnapshot -> the ops snapshot persistence seam
//   applyDecision(input)         -> apply a human verdict to one action card
//   getAgentTasks()              -> items queued after request_changes
//   getConfigSummary()           -> sanitized config info for the UI
//   getOnboarding() / completeOnboarding()
//   getLock() / acquireLock() / releaseLock()
//
// createProvider() validates the selected provider with assertProvider() so a
// non-conforming provider fails loudly at registration.

import os from "node:os";
import path from "node:path";
import { readJson } from "../common.ts";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Action-card statuses shared across providers. Busabase maps its
// change-request status onto these so the UI renders identically in either mode.
export const ACTION_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

export const DECISION_VERDICTS = ["approve", "request_changes", "block", "note"];

function configCandidates(): string[] {
  return [
    process.env.KELLY_DEVOPS_CONFIG,
    path.join(SKILL_DIR, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-devops", "config.json"),
    path.join(SKILL_DIR, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    const config = await readJson<Config>(candidate, null);
    if (config) {
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    }
  }
  return { config: {}, source: null, is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_DEVOPS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  let provider: unknown;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_DEVOPS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  return assertProvider(kind, provider);
}
