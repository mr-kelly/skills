import fs from "node:fs/promises";
import path from "node:path";
import { cacheDir, lockPath } from "./paths.ts";

export async function ensureDirs(...dirs) {
  await fs.mkdir(cacheDir, { recursive: true });
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

// A lock left in place longer than this is assumed to be abandoned by a
// crashed/killed process (writeJson happens before fn(), fs.rm only runs in
// `finally`, so SIGKILL/OOM between the two leaves agent.lock behind forever)
// rather than an agent still actively writing.
const LOCK_STALE_MS = 5 * 60 * 1000;

// Read agent.lock, treating a lock older than LOCK_STALE_MS as stale and
// clearing it so review actions aren't blocked indefinitely by a crash.
export async function readActiveLock() {
  const lock = await readJson(lockPath, null);
  if (!lock) return null;
  const startedAt = Date.parse(lock.started_at || "");
  if (Number.isFinite(startedAt) && Date.now() - startedAt > LOCK_STALE_MS) {
    await fs.rm(lockPath, { force: true });
    return null;
  }
  return lock;
}

export async function withLock(message, fn) {
  await ensureDirs();
  await writeJson(lockPath, {
    owner: "kelly-writer",
    message,
    started_at: new Date().toISOString(),
  });
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

export function slugify(input) {
  return (
    String(input || "content")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 80) || "content"
  );
}

export function isoStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
}
