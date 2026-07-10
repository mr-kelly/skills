// Shared path constants for scripts (the server has its own app/server/paths.ts
// scoped to app/, since it must stay relocatable under APP_DIR).

import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
