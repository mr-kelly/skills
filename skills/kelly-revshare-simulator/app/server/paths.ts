import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(SERVER_DIR, "..");
export const SKILL_DIR = path.resolve(APP_DIR, "..");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MAX = 4000;
