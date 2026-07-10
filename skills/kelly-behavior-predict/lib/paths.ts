import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared path constants for scripts, lib/, and the app server. Resolved from
// this file's own location so callers can `node scripts/x.ts` from anywhere.
export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");

// The generated mock dataset (funnel + segments + backtest sample).
export const DATASET_PATH = path.join(DATA_DIR, "dataset.json");
// Human review decisions, keyed by segment id — the file handoff contract.
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");

export const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.json");
