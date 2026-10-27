import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const AIRAPP_DIR = path.resolve(LIB_DIR, "..");
export const SKILL_DIR = path.resolve(AIRAPP_DIR, "..");
export const APP_DIR = path.join(AIRAPP_DIR, "app");
export const SERVER_DIR = path.join(AIRAPP_DIR, "server");

export function findRepoRoot(start = SKILL_DIR) {
  let current = path.resolve(start);
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, ".git"))) return current;
    current = path.dirname(current);
  }
  return path.resolve(SKILL_DIR, "../..");
}

export const ROOT_DIR = findRepoRoot();
