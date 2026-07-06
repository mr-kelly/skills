import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/ sits directly under the skill root, so ".." is the skill dir. These paths
// intentionally point at the SAME app/.data/*.json files the original
// app/server/store.ts read and wrote, so the local provider is byte-compatible
// with the pre-refactor server.
export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative, not disposable — kept in .data (spec).
export const dataDir = path.join(appDir, ".data");
// Runtime artifacts (server log, PID file) are regenerable — kept in .cache.
export const runtimeCacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "social_snapshot.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3000;
export const preferredPortMin = 3000;
export const preferredPortMax = 4000;
