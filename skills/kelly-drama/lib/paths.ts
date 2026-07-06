import path from "node:path";
import { fileURLToPath } from "node:url";

// Filesystem layout for the kelly-drama App-in-Skill. These paths are the
// authoritative locations for the local-file provider; the Hono server and
// scripts import them so every module agrees on where state lives.
//
// `.data/` holds authoritative handoff state (project.json, config blobs, the
// agent lock, and generated media). `.cache/` holds regenerable runtime
// artifacts (server log + PID file). This mirrors the original app/server/paths.

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const PROJECT_PATH = path.join(DATA_DIR, "project.json");
export const ACTIVE_PROJECT_PATH = path.join(DATA_DIR, "active_project.json");
export const IMAGE_CONFIG_PATH = path.join(DATA_DIR, "image_config.json");
export const VIDEO_CONFIG_PATH = path.join(DATA_DIR, "video_config.json");
export const TTS_CONFIG_PATH = path.join(DATA_DIR, "tts_config.json");
export const GENERATED_DIR = path.join(DATA_DIR, "generated");
export const STORYBOARD_IMAGE_DIR = path.join(GENERATED_DIR, "storyboards");
export const REFERENCE_IMAGE_DIR = path.join(GENERATED_DIR, "references");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const STARTER_PROJECT_PATH = path.join(SKILL_DIR, "assets", "starter-project.json");

// Config discovery, in precedence order (first hit wins). The app runs fine
// with no config file at all — config only selects the data provider and
// carries the busabase connection block.
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.json");
export const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3037;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
