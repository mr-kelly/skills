import fs from "node:fs/promises";
import path from "node:path";
import { cacheDir, lockPath } from "./paths.mjs";

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

export async function withLock(message, fn) {
  await ensureDirs();
  await writeJson(lockPath, {
    owner: "kelly-content",
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
