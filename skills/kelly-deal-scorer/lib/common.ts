import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, LOCK_PATH, SKILL_DIR } from "./paths.ts";

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

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

export async function acquireLock(owner: string, message: string): Promise<void> {
  await ensureDirs();
  await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() } satisfies Lock);
}

export async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function withLock<T>(owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(owner, message);
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
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

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_DEAL_SCORER_CONFIG) paths.push(process.env.KELLY_DEAL_SCORER_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-deal-scorer", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_DEAL_SCORER_ENV_FILE) paths.push(process.env.KELLY_DEAL_SCORER_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-deal-scorer", ".env"));
  return paths;
}
