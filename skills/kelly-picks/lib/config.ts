// Config + dotenv discovery for kelly-picks. Shared by the provider selector
// (index.ts) and the local-file provider so config resolution is identical
// everywhere: the same search order, the same .env layering.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { Config, ConfigResult } from "./types.ts";

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_PICKS_CONFIG) paths.push(process.env.KELLY_PICKS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-picks", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_PICKS_ENV_FILE) paths.push(process.env.KELLY_PICKS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-picks", ".env"));
  return paths;
}

async function readJsonFile<T = unknown>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJsonFile<Config>(file);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { sources: [], platforms: [] }, path: "", is_example: false };
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
