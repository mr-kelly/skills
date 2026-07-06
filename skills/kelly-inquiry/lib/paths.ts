// Filesystem layout for the kelly-inquiry data-provider layer.
//
// This is the single source of truth for where handoff state lives. The local
// provider reads/writes app/.data/*.json exactly where app/server/store.ts used
// to, so switching KELLY_INQUIRY_DATA_PROVIDER=local|busabase is a config flip,
// not a data migration. app/server/paths.ts re-exports these so the server,
// launcher, and scripts keep their original import paths.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
// Handoff state is authoritative, not disposable — use .data, not .cache (spec).
export const DATA_DIR = path.join(APP_DIR, ".data");
// Runtime artifacts (server log, PID file) are regenerable — keep them in .cache.
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "inquiry_snapshot.json");
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
