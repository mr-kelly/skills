import fs from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, DATA_DIR, LOCK_PATH } from "./paths.ts";

// Small shared JSON/lock helpers used by scripts, the data provider, and the
// app server. Kept dependency-free (built-in fs/path only).

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

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

export interface LockInfo {
  owner: string;
  message: string;
  started_at: string;
}

export async function withLock<T>(owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  await ensureDirs();
  const lock: LockInfo = { owner, message, started_at: new Date().toISOString() };
  await writeJson(LOCK_PATH, lock);
  try {
    return await fn();
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}
