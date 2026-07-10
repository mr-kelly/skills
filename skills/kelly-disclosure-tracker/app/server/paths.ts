import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(SERVER_DIR, "..");
export const SKILL_DIR = path.resolve(APP_DIR, "..");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const BATCH_PATH = path.join(DATA_DIR, "current_batch.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const EXECUTION_REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
