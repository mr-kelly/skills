import path from "node:path";
import { fileURLToPath } from "node:url";

// This module lives at skills/kelly-campaigns/lib/paths.ts, so the skill root is
// one directory up. The data-provider layer keeps the ORIGINAL app/.data/*.json
// layout byte-for-byte: the local provider just moved here from app/server/store.ts.
export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative — app/.data (not .cache), matching the spec and
// the paths app/server/store.ts used before the retrofit.
export const dataDir = path.join(appDir, ".data");
export const runtimeCacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "campaigns_snapshot.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const suppressionPath = path.join(dataDir, "suppression.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3210;
export const preferredPortMin = 3210;
export const preferredPortMax = 3999;
