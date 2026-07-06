// Launcher-time environment helpers.
//
// All data-access (snapshot / decisions / agent tasks / execution report /
// onboarding / lock / config) moved to the data-provider layer under lib/
// (see lib/data-provider/*.ts). What remains here is process bootstrap that is
// orthogonal to which backend serves the data: ensuring the local data dir
// exists and loading .env files into process.env before the Hono app starts.
//
// `ensureDirs` is re-exported from the local-file provider so there is a single
// source of truth for where app/.data lives.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";

export { ensureDirs } from "../../lib/data-provider/local-file-provider.ts";

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
  if (process.env.KELLY_LAUNCH_ENV_FILE) paths.push(process.env.KELLY_LAUNCH_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", ".env"));
  return paths;
}
