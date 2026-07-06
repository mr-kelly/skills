// Data-provider selector for kelly-brand.
//
// kelly-brand is an App-in-Skill whose unit of work — a brand-narrative asset
// under review-before-adoption — maps cleanly onto Busabase's review model
// (record + change_request + operation + commit + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_BRAND_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_BRAND_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface (provider-interface.ts), so a
// caller obtains one from createProvider() and never branches on the backend.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, skillDir } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Workflow statuses shared across providers. Busabase maps its change-request
// status onto these so the UI renders identically in either mode.
export const WORKFLOW_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise", "resolve_drift", "dismiss_drift"];

function configCandidates(): string[] {
  return [
    process.env.KELLY_BRAND_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(process.env.HOME || "", ".config", "kelly-brand", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8")) as Config;
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: {}, source: null, is_example: false };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_BRAND_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

const validated = new Map<string, DataProvider>();

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  const cached = validated.get(kind);
  if (cached) return cached;

  let provider: DataProvider;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_BRAND_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);

  const conformed = assertProvider(kind, provider); // fail loud at registration
  validated.set(kind, conformed);
  return conformed;
}

// ---- runtime helpers shared by the server entrypoints ----

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_BRAND_ENV_FILE) paths.push(process.env.KELLY_BRAND_ENV_FILE);
  paths.push(path.resolve(skillDir, "..", "..", ".env"));
  paths.push(path.join(skillDir, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-brand", ".env"));
  return paths;
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
