import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/ sits at the skill root alongside app/, scripts/, references/.
export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");

export const EVAL_RUN_PATH = path.join(DATA_DIR, "eval_run.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const RELEASE_DECISION_PATH = path.join(DATA_DIR, "release_decision.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
