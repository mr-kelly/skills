import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/ sits directly under the skill root, next to app/. The data-provider layer
// and scripts reach handoff state through these constants so a backend swap is a
// config switch, not a path rewrite.
export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative, not disposable — it lives in app/.data (spec).
export const dataDir = path.join(appDir, ".data");
// Runtime artifacts (server log, PID file) are regenerable — keep them in .cache.
export const runtimeCacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "ads_snapshot.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3000;
export const preferredPortMin = 3000;
export const preferredPortMax = 4000;
