// Path constants for the kelly-mv data-provider layer.
//
// These MUST resolve to the SAME on-disk locations the app used before the
// provider refactor (app/.data/*.json + app/.data/generated/*), so a project
// created by the old server keeps working and /api/state stays byte-identical.
// The lib lives at skills/kelly-mv/lib/, so skillDir is one level up.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const libDir = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.resolve(libDir, "..");
export const appDir = path.join(skillDir, "app");
export const serverDir = path.join(appDir, "server");

// Authoritative handoff state + generated media live under app/.data (not
// .cache): they carry user decisions and generated assets, so they are not
// disposable. Runtime artifacts (pid/log) stay in app/.cache.
export const dataDir = path.join(appDir, ".data");
export const runtimeCacheDir = path.join(appDir, ".cache");
export const exportsDir = path.join(skillDir, "exports");

export const projectPath = path.join(dataDir, "project.json");
export const activeProjectPath = path.join(dataDir, "active_project.json");
export const imageConfigPath = path.join(dataDir, "image_config.json");
export const songConfigPath = path.join(dataDir, "song_config.json");
export const videoConfigPath = path.join(dataDir, "video_config.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const reportPath = path.join(dataDir, "execution_report.json");
export const tasksPath = path.join(dataDir, "agent_tasks.json");

// Generated media (storyboards, references, songs, videos) served read-only.
export const generatedDir = path.join(dataDir, "generated");
export const storyboardImageDir = path.join(generatedDir, "storyboards");
export const referenceImageDir = path.join(generatedDir, "references");
export const songDir = path.join(generatedDir, "songs");
export const videoDir = path.join(generatedDir, "videos");

export const pidPath = path.join(runtimeCacheDir, "server.pid");
export const logPath = path.join(runtimeCacheDir, "server.log");
export const starterProjectPath = path.join(skillDir, "assets", "starter-project.json");

export const defaultHost = "127.0.0.1";
export const defaultPort = 3041;
export const preferredPortMin = 3000;
export const preferredPortMax = 4000;
