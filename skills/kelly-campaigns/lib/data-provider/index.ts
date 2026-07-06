// Data-provider selector for kelly-campaigns.
//
// kelly-campaigns is an App-in-Skill whose unit of work — an email send under
// approve-before-send — maps cleanly onto Busabase's review model
// (record + change_request + operation + commit + review + merge). This module
// lets the same UI and scripts run against either backend:
//
//   KELLY_CAMPAIGNS_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_CAMPAIGNS_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same DataProvider interface. assertProvider() runs at
// registration so a non-conforming provider fails loudly instead of mid-request.

import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config, ConfigResult } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_CAMPAIGNS_CONFIG) paths.push(process.env.KELLY_CAMPAIGNS_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-campaigns", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

async function readJson(file: string) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { from_identities: [], segments: [] }, path: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_CAMPAIGNS_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const result = await loadConfig();
  const meta = { config: result.config, source: result.path || null, is_example: result.is_example };
  const kind = resolveProviderKind(result.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_CAMPAIGNS_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
