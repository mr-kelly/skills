// Data-provider selector for kelly-content.
//
// kelly-content is an App-in-Skill whose unit of work — a content piece under
// review-before-publish — maps cleanly onto Busabase's review model
// (record + change_request + operation + commit + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_CONTENT_DATA_PROVIDER=local     (default) JSON files in app/.cache/
//   KELLY_CONTENT_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same ReviewProvider interface (review vocabulary):
//   getState()                  -> { batch, decisions, lock, config_summary }
//   saveDecision(payload)       -> apply a human verdict / edit to one item
//   confirmDirection(payload)   -> (local-only ideation) confirm a topic direction
//   startTodo(payload)          -> (local-only ideation) start a main draft
//   putBatch(batch)             -> persist the agent-prepared drafts
//   exportApproved()            -> publish/merge approved items
//   listAgentTasks()            -> items the agent should revise (changes_requested / @ai)
//   configSummary()             -> sanitized provider info for the UI
//
// saveDecision actions are the provider-neutral review verbs:
//   approve | revise (save human edits) | request_changes (ask the agent) | block

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";

// Workflow status is shared across providers. Busabase maps its change-request
// status onto these so the UI renders identically in either mode.
export const WORKFLOW_STATUSES = ["needs_review", "to_approve", "approved", "done", "blocked"];

export const DECISION_ACTIONS = ["approve", "revise", "request_changes", "block"];

function configCandidates() {
  return [
    process.env.KELLY_CONTENT_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-content", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean);
}

async function loadConfig() {
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
  return String(process.env.KELLY_CONTENT_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider() {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return createLocalFileProvider(meta);
  if (kind === "busabase") return createBusabaseProvider(meta);
  throw new Error(`Unknown KELLY_CONTENT_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
