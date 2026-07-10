import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, DATA_DIR, ENV_PREFIX, SKILL_DIR } from "./paths.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
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

export async function withLock<T>(lockPath: string, owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  const lock: Lock = { owner, message, started_at: new Date().toISOString() };
  await writeJson(lockPath, lock);
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  const envOverride = process.env[`${ENV_PREFIX}_CONFIG`];
  if (envOverride) paths.push(envOverride);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-revshare-simulator", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  const envFile = process.env[`${ENV_PREFIX}_ENV_FILE`];
  if (envFile) paths.push(envFile);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-revshare-simulator", ".env"));
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

export interface ConfigResult {
  config: Record<string, unknown>;
  path: string;
  is_example: boolean;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Record<string, unknown>>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}
