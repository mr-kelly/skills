import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(SERVER_DIR, "..");
export const SKILL_DIR = path.resolve(APP_DIR, "..");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const PROJECT_PATH = path.join(DATA_DIR, "project.json");
export const ACTIVE_PROJECT_PATH = path.join(DATA_DIR, "active_project.json");
export const IMAGE_CONFIG_PATH = path.join(DATA_DIR, "image_config.json");
export const GENERATED_DIR = path.join(DATA_DIR, "generated");
export const STORYBOARD_IMAGE_DIR = path.join(GENERATED_DIR, "storyboards");
export const REFERENCE_IMAGE_DIR = path.join(GENERATED_DIR, "references");
export const SONG_DIR = path.join(GENERATED_DIR, "songs");
export const SONG_CONFIG_PATH = path.join(DATA_DIR, "song_config.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const STARTER_PROJECT_PATH = path.join(SKILL_DIR, "assets", "starter-project.json");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3041;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;
