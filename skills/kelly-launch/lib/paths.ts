import path from "node:path";
import { fileURLToPath } from "node:url";

// This file lives at skills/kelly-launch/lib/paths.ts, so the skill root is one
// level up. The data-provider layer keeps its own copy of the path constants so
// lib/ has no dependency on app/server/. The values are byte-identical to
// app/server/paths.ts — the local provider must read and write the SAME
// app/.data/*.json files the original store.ts used.
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "launch_snapshot.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const AGENT_TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const EXECUTION_REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
