import path from "node:path";
import { fileURLToPath } from "node:url";

export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative, not disposable — use .data, not .cache (spec).
export const dataDir = path.join(appDir, ".data");
export const cacheDir = dataDir; // back-compat alias
// Runtime artifacts (server log, PID file) are regenerable — keep them in .cache.
export const runtimeCacheDir = path.join(appDir, ".cache");
export const exportsDir = path.join(skillDir, "exports");
export const currentBatchPath = path.join(cacheDir, "current_batch.json");
export const decisionsPath = path.join(cacheDir, "decisions.json");
export const exportReportPath = path.join(cacheDir, "export_report.json");
export const lockPath = path.join(cacheDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3000;
export const preferredPortMin = 3000;
export const preferredPortMax = 4000;
