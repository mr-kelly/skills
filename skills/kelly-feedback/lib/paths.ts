import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/ sits directly under the skill root, so the skill dir is one level up.
// The data layer keeps writing to the SAME app/.data/*.json files the original
// app/server/store.ts used, so KELLY_FEEDBACK_DATA_PROVIDER=local is a config
// switch, not a data migration.
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
// Handoff state is authoritative, not disposable — use .data.
export const DATA_DIR = path.join(APP_DIR, ".data");
// Runtime artifacts (server log, PID file) are regenerable — keep them in .cache.
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "feedback_snapshot.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const AGENT_TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const EXECUTION_REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
