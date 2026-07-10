import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

// Re-exports APP_DIR, DATA_DIR, LEADS_PATH, LOCK_PATH, DEFAULT_PORT, etc.
export * from "../../lib/paths.ts";
