import path from "node:path";
import { fileURLToPath } from "node:url";

// Filesystem anchors for the data-provider layer. This module lives in
// skills/kelly-family-fund/lib/, so SKILL_DIR is one directory up. The handoff
// state paths are intentionally identical to the originals in
// app/server/paths.ts (app/.data/*.json), so switching to the data-provider
// layer does not move or rename any file the dashboard or scripts read.

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const IMPORT_REPORT_PATH = path.join(DATA_DIR, "import_report.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
