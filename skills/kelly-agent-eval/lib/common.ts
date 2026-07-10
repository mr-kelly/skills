import fs from "node:fs/promises";
import { CACHE_DIR, DATA_DIR, LOCK_PATH } from "./paths.ts";

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

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
  await ensureDirs();
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function withLock<T>(owner: string, message: string, fn: () => Promise<T>): Promise<T> {
  await ensureDirs();
  const lock: Lock = { owner, message, started_at: new Date().toISOString() };
  await fs.writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  try {
    return await fn();
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

export async function readLock(): Promise<Lock | null> {
  return readJson<Lock>(LOCK_PATH, null);
}
