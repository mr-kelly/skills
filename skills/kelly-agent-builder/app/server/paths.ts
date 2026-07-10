import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENTS_PATH,
  CACHE_DIR,
  DATA_DIR,
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOCK_PATH,
  LOG_PATH,
  ONBOARDING_PATH,
  PID_PATH,
  PREFERRED_PORT_MAX,
  SKILL_DIR,
  envSearchPaths,
} from "../../lib/paths.ts";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(SERVER_DIR, "..");

export {
  AGENTS_PATH,
  CACHE_DIR,
  DATA_DIR,
  DEFAULT_HOST,
  DEFAULT_PORT,
  envSearchPaths,
  LOCK_PATH,
  LOG_PATH,
  ONBOARDING_PATH,
  PID_PATH,
  PREFERRED_PORT_MAX,
  SKILL_DIR,
};
