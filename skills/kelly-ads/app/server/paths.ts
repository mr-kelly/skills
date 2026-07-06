// Path constants now live in the data-provider layer at lib/paths.ts so the
// providers and scripts share them. This module re-exports them under the
// UPPER_CASE names the existing app/server/* and scripts/* imports use.
import {
  agentTasksPath,
  appDir,
  dataDir,
  decisionsPath,
  defaultHost,
  defaultPort,
  executionReportPath,
  lockPath,
  logPath,
  onboardingPath,
  pidPath,
  preferredPortMax,
  preferredPortMin,
  runtimeCacheDir,
  serverDir,
  skillDir,
  snapshotPath,
} from "../../lib/paths.ts";

export const SERVER_DIR = serverDir;
export const APP_DIR = appDir;
export const SKILL_DIR = skillDir;
export const DATA_DIR = dataDir;
export const CACHE_DIR = runtimeCacheDir;
export const SNAPSHOT_PATH = snapshotPath;
export const DECISIONS_PATH = decisionsPath;
export const AGENT_TASKS_PATH = agentTasksPath;
export const EXECUTION_REPORT_PATH = executionReportPath;
export const ONBOARDING_PATH = onboardingPath;
export const LOCK_PATH = lockPath;
export const LOG_PATH = logPath;
export const PID_PATH = pidPath;
export const DEFAULT_HOST = defaultHost;
export const DEFAULT_PORT = defaultPort;
export const PREFERRED_PORT_MIN = preferredPortMin;
export const PREFERRED_PORT_MAX = preferredPortMax;
