// Filesystem layout for the kelly-launch data-provider layer.
//
// lib/ sits beside app/. The local-file provider reads/writes the SAME
// app/.data/*.json files the original store.ts used, so switching provider is a
// config flip, not a data migration. Runtime artifacts (server log, PID) stay in
// app/.cache/ because they are regenerable; handoff state stays in app/.data/.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative — app/.data/ (matches app/server/paths.ts DATA_DIR).
export const dataDir = path.join(appDir, ".data");
// Runtime artifacts (server log, PID file) are regenerable — app/.cache/.
export const runtimeCacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "launch_snapshot.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3220;
export const preferredPortMin = 3220;
export const preferredPortMax = 3999;
