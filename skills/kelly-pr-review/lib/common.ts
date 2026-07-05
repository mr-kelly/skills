import fs from "node:fs/promises";
import path from "node:path";
import { LOCK_PATH } from "./paths.ts";

export function utcNow() {
  return new Date().toISOString();
}

export async function pathExists(pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(pathname, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8"));
  } catch (error) {
    if (fallback !== null && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(pathname, value) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function withLock(message, fn) {
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
  await writeJson(LOCK_PATH, {
    owner: "kelly-pr-review",
    message,
    started_at: utcNow(),
  });
  try {
    return await fn();
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

export function normalizeQueryValue(value, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

export function truncateText(value, max = 4000) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 28).trimEnd()}\n\n[truncated locally]`;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
