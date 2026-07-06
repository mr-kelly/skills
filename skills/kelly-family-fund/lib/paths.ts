// Filesystem layout for the kelly-family-fund data-provider layer.
//
// The lib lives at skills/kelly-family-fund/lib/; the skill root is one level
// up and the Hono app (with its authoritative .data/ handoff files) sits under
// app/. These paths are byte-for-byte the same locations the previous
// app/server/store.ts + app/server/paths.ts used, so switching to the provider
// layer does not move any file.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.resolve(libDir, "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");
// Handoff state is authoritative, not disposable — use .data (spec).
export const dataDir = path.join(appDir, ".data");
// Runtime artifacts (server log, PID file) are regenerable — keep them in .cache.
export const runtimeCacheDir = path.join(appDir, ".cache");
export const snapshotPath = path.join(dataDir, "snapshot.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const importReportPath = path.join(dataDir, "import_report.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const defaultHost = "127.0.0.1";
export const defaultPort = 3000;
export const preferredPortMin = 3000;
export const preferredPortMax = 4000;
