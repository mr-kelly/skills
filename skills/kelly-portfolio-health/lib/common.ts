import fs from "node:fs/promises";
import { CACHE_DIR, DATA_DIR } from "./paths.ts";

// Shared JSON / lock / env helpers used by both the app server and the CLI
// scripts. Kept dependency-free (built-in node:fs only).

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
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function withLock<T>(lockPath: string, owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  await writeJson(lockPath, { owner, message, started_at: new Date().toISOString() });
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
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

export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}
