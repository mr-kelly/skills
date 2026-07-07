import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_PREFIX, SNAPSHOT_FILE } from "./types.ts";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const SERVER_DIR = path.join(APP_DIR, "server");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, SNAPSHOT_FILE);
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const AGENT_TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const EXECUTION_REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3110;
export const PREFERRED_PORT_MAX = 4000;

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  const explicit = process.env[`${ENV_PREFIX}_CONFIG`];
  if (explicit) paths.push(explicit);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-legal-precedent-desk", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  const explicit = process.env[`${ENV_PREFIX}_ENV_FILE`];
  if (explicit) paths.push(explicit);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-legal-precedent-desk", ".env"));
  return paths;
}
