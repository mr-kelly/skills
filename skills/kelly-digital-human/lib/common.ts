import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./paths.ts";

export async function ensureDirs(...dirs: string[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  for (const dir of dirs) await fs.mkdir(dir, { recursive: true });
}

export async function readJson(file: string, fallback: unknown = null): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
