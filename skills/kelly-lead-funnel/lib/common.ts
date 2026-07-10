import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, DATA_DIR, LOCK_PATH, SKILL_DIR } from "./paths.ts";

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

export async function appendJsonLog(file: string, entry: Record<string, unknown>, cap = 500): Promise<void> {
  const existing = (await readJson<Record<string, unknown>[]>(file, [])) || [];
  existing.push(entry);
  await writeJson(file, existing.slice(-cap));
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---- Lock ----

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

export async function withLock<T>(owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  const lock: Lock = { owner, message, started_at: new Date().toISOString() };
  await writeJson(LOCK_PATH, lock);
  try {
    return await fn();
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

export async function readLock(): Promise<Lock | null> {
  return readJson<Lock>(LOCK_PATH, null);
}

// ---- Config / env discovery (private configuration priority) ----

export function configSearchPaths(envPrefix: string, skillName: string): string[] {
  const paths: string[] = [];
  const explicit = process.env[`${envPrefix}_CONFIG`];
  if (explicit) paths.push(explicit);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", skillName, "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(envPrefix: string, skillName: string): string[] {
  const paths: string[] = [];
  const explicit = process.env[`${envPrefix}_ENV_FILE`];
  if (explicit) paths.push(explicit);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", skillName, ".env"));
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
