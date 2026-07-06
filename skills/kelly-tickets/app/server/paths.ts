// Re-export the canonical path constants from lib/. The data-provider layer owns
// the on-disk locations now; the server keeps importing them from here so the
// SERVER_DIR/CACHE_DIR names the launcher relies on stay stable.
export {
  APP_DIR,
  CACHE_DIR,
  DATA_DIR,
  DECISIONS_PATH,
  AGENT_TASKS_PATH,
  DEFAULT_HOST,
  DEFAULT_PORT,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  LOG_PATH,
  ONBOARDING_PATH,
  PID_PATH,
  PREFERRED_PORT_MAX,
  PREFERRED_PORT_MIN,
  SERVER_DIR,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "../../lib/paths.ts";
