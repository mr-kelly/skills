import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CACHE_DIR,
  DATA_DIR,
  DEFAULT_HOST,
  DEFAULT_PORT,
  PREFERRED_PORT_MAX,
  PREFERRED_PORT_MIN,
} from "../../lib/paths.ts";

// Server-only runtime paths (log/pid) live here; everything shared with the
// scripts lives in lib/paths.ts so both sides agree on where files are.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(SERVER_DIR, "..");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");

export { CACHE_DIR, DATA_DIR, DEFAULT_HOST, DEFAULT_PORT, PREFERRED_PORT_MAX, PREFERRED_PORT_MIN };
