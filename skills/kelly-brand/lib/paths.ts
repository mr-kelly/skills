// Shared filesystem paths for the kelly-brand data-provider layer and scripts.
//
// These are the single source of truth for where handoff state lives. Handoff
// data is authoritative (not disposable), so it lives under app/.data; runtime
// artifacts (server log, PID) are regenerable and stay in app/.cache.
//
// The local-file provider, the Hono server, and the batch scripts all import
// from here, so a path only ever needs to change in one place.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.resolve(libDir, "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
export const dataDir = path.join(appDir, ".data");
export const cacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "brand_snapshot.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(cacheDir, "server.log");
export const pidPath = path.join(cacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3230;
export const preferredPortMin = 3230;
export const preferredPortMax = 3999;
