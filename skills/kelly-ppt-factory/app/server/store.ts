import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, SKILL_DIR } from "./paths.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
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

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_PPT_FACTORY_ENV_FILE) paths.push(process.env.KELLY_PPT_FACTORY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-ppt-factory", ".env"));
  return paths;
}
