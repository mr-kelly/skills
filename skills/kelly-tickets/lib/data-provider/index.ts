// Data-provider selector for kelly-tickets.
//
// kelly-tickets is an App-in-Skill whose unit of work — a dispatch proposal
// awaiting a human verdict before a crew is notified — maps cleanly onto
// Busabase's review model (change_request + review + merge). This module lets
// the same UI and scripts run against either backend:
//
//   KELLY_TICKETS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_TICKETS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same TicketsProvider (complaint-desk store surface):
//   getState()             -> aggregate /api/state payload, decisions merged
//   submitDecision(input)  -> apply a human verdict to one board item
//   configSummary()        -> sanitized provider info for the UI
//   ensureStore / read*/write* -> granular store I/O used by the scripts

import os from "node:os";
import path from "node:path";
import { readJson } from "../common.ts";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type TicketsProvider, assertProvider } from "./provider-interface.ts";

export const PROPOSAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const DECISION_ACTIONS = ["approve", "request_changes", "revise", "block"];

function configCandidates() {
  return [
    process.env.KELLY_TICKETS_CONFIG,
    path.join(SKILL_DIR, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-tickets", "config.json"),
    path.join(SKILL_DIR, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    const config = await readJson<Config | null>(candidate, null);
    if (config) {
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    }
  }
  return { config: {}, source: null, is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_TICKETS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<TicketsProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  let provider: TicketsProvider;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_TICKETS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  return assertProvider(kind, provider);
}
