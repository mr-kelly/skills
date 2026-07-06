// Data-provider selector for kelly-lesson.
//
// kelly-lesson is an App-in-Skill whose unit of work — a lesson plan under
// review-before-approval — maps cleanly onto Busabase's review model (record +
// change_request + operation + commit + review + merge). This module lets the
// same UI and scripts run against either backend:
//
//   KELLY_LESSON_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_LESSON_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same LessonProvider interface (see provider-interface.ts).

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type LessonProvider, assertProvider } from "./provider-interface.ts";

function configCandidates(): string[] {
  return [
    process.env.KELLY_LESSON_CONFIG,
    path.join(SKILL_DIR, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-lesson", "config.json"),
    path.join(SKILL_DIR, "config.example.json"),
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
  return String(process.env.KELLY_LESSON_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<LessonProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_LESSON_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
