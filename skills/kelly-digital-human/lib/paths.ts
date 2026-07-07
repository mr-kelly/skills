import path from "node:path";
import { fileURLToPath } from "node:url";

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.resolve(libDir, "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
export const dataDir = path.join(appDir, ".data");
export const cacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "digital_human_snapshot.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(cacheDir, "server.log");
export const pidPath = path.join(cacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3240;
export const preferredPortMax = 3999;
