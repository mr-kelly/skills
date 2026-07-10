import fs from "node:fs/promises";
import path from "node:path";
import type { FleetData, Handoff } from "../../lib/types.ts";
import { DATA_DIR, FLEET_PATH, HANDOFFS_PATH, SKILL_DIR } from "./paths.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export function emptyFleet(): FleetData {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    agents: [],
    metrics: [],
    traces: [],
  };
}

export async function readFleet(): Promise<FleetData> {
  return (await readJson<FleetData>(FLEET_PATH, emptyFleet())) as FleetData;
}

export async function readHandoffs(): Promise<Handoff[]> {
  try {
    const raw = await fs.readFile(HANDOFFS_PATH, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Handoff);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendHandoff(handoff: Handoff): Promise<void> {
  await ensureDirs();
  await fs.appendFile(HANDOFFS_PATH, `${JSON.stringify(handoff)}\n`, "utf8");
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

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AGENT_OBS_ENV_FILE) paths.push(process.env.KELLY_AGENT_OBS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  return paths;
}
