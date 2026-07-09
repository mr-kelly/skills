import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
// Handoff state is authoritative, not disposable — use .data, not .cache (spec).
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = DATA_DIR; // back-compat alias
// Scan progress is genuinely regenerable cache, so it stays in .cache.
export const SKILL_CACHE_DIR = path.join(SKILL_DIR, ".cache");
export const BATCH_DIR = path.join(CACHE_DIR, "batches");
export const ATTACHMENTS_DIR = path.join(CACHE_DIR, "attachments");
export const EMAIL_RECORDS_PATH = path.join(CACHE_DIR, "email_records.json");
export const CURRENT_BATCH_PATH = path.join(CACHE_DIR, "current_batch.json");
export const DECISIONS_PATH = path.join(CACHE_DIR, "decisions.json");
export const LOCK_PATH = path.join(CACHE_DIR, "agent.lock");
export const LEGACY_REVIEW_ITEMS_PATH = path.join(CACHE_DIR, "review_items.json");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const REPORTS_DIR = path.join(CACHE_DIR, "execution_reports");
export const SCAN_STATE_PATH = path.join(SKILL_CACHE_DIR, "scan_state.json");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
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
