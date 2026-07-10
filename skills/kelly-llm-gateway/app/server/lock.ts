import fs from "node:fs/promises";
import { LOCK_PATH } from "./paths.ts";

export interface Lock {
  owner: string;
  message: string;
  started_at: string;
}

export async function withLock<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const lock: Lock = { owner: "kelly-llm-gateway", message, started_at: new Date().toISOString() };
  await fs.writeFile(LOCK_PATH, JSON.stringify(lock, null, 2));
  try {
    return await fn();
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}
