// Path constants for the Hono server, re-exported from the data-provider layer.
//
// The canonical definitions now live in lib/paths.ts (camelCase) so the provider
// layer, the scripts, and the runtime all share one filesystem layout. This shim
// keeps the historical UPPER_CASE names the server modules (launcher.ts,
// hono.ts, index.ts) import, mapping each to its lib/ counterpart.

export {
  serverDir as SERVER_DIR,
  appDir as APP_DIR,
  skillDir as SKILL_DIR,
  dataDir as DATA_DIR,
  runtimeCacheDir as CACHE_DIR,
  ledgerPath as LEDGER_PATH,
  onboardingPath as ONBOARDING_PATH,
  syncReportPath as SYNC_REPORT_PATH,
  lockPath as LOCK_PATH,
  logPath as LOG_PATH,
  pidPath as PID_PATH,
  defaultHost as DEFAULT_HOST,
  defaultPort as DEFAULT_PORT,
  preferredPortMin as PREFERRED_PORT_MIN,
  preferredPortMax as PREFERRED_PORT_MAX,
} from "../../lib/paths.ts";
