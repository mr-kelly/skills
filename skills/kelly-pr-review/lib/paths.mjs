import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const BATCH_DIR = path.join(CACHE_DIR, "batches");
export const CURRENT_BATCH_PATH = path.join(CACHE_DIR, "current_batch.json");
export const DECISIONS_PATH = path.join(CACHE_DIR, "decisions.json");
export const TESTED_PATH = path.join(CACHE_DIR, "tested.json");
export const LOCK_PATH = path.join(CACHE_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const EXECUTION_REPORT_PATH = path.join(CACHE_DIR, "execution_report.json");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3001;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;

export function findRepoRoot(start = SKILL_DIR) {
  let current = path.resolve(start);
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, ".git"))) return current;
    current = path.dirname(current);
  }
  return path.resolve(SKILL_DIR, "../..");
}

export const ROOT_DIR = findRepoRoot();
