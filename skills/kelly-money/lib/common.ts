// Runtime bootstrap helpers shared by the launcher and the server entrypoint.
//
// These are provider-agnostic process setup (ensure the .data dir exists, load
// .env files into process.env). They were previously in app/server/store.ts;
// they live here now so both the data-provider layer and the runtime can share
// the same paths without importing server internals.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, skillDir } from "./paths.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

export function envSearchPaths(): string[] {
  const paths = [];
  if (process.env.KELLY_MONEY_ENV_FILE) paths.push(process.env.KELLY_MONEY_ENV_FILE);
  paths.push(path.resolve(skillDir, "..", "..", ".env"));
  paths.push(path.join(skillDir, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", ".env"));
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
