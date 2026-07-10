import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared path constants for lib/, scripts/, and app/server/ so the file
// contract stays identical no matter which entrypoint runs.

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");

export const AGENTS_PATH = path.join(DATA_DIR, "agents.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
export const LOG_PATH = path.join(CACHE_DIR, "server.log");
export const PID_PATH = path.join(CACHE_DIR, "server.pid");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3100;
export const PREFERRED_PORT_MIN = 3100;
export const PREFERRED_PORT_MAX = 4100;

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AGENT_BUILDER_CONFIG) paths.push(process.env.KELLY_AGENT_BUILDER_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-agent-builder", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AGENT_BUILDER_ENV_FILE) paths.push(process.env.KELLY_AGENT_BUILDER_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-agent-builder", ".env"));
  return paths;
}
