import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, SKILL_DIR } from "./paths.ts";

// Runtime bootstrap helpers for the local server (app/server/index.ts). All
// brand narrative read/write logic now lives behind the data-provider layer in
// lib/ (see lib/data-provider/*); this file only ensures the data dir exists and
// loads .env files before the Hono app is served.

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadDotenvFiles(files) {
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
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_BRAND_ENV_FILE) paths.push(process.env.KELLY_BRAND_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-brand", ".env"));
  return paths;
}
