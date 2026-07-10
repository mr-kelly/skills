import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/paths.ts is the canonical source of skill-relative paths, shared by the
// Hono app server and the standalone scripts (seed/validate). app/server/paths.ts
// re-exports these plus a couple of server-only runtime paths (log/pid).

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");

export const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const PREFERRED_PORT_MIN = 3000;
export const PREFERRED_PORT_MAX = 4000;

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_PORTFOLIO_HEALTH_CONFIG) paths.push(process.env.KELLY_PORTFOLIO_HEALTH_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-portfolio-health", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_PORTFOLIO_HEALTH_ENV_FILE) paths.push(process.env.KELLY_PORTFOLIO_HEALTH_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-portfolio-health", ".env"));
  return paths;
}
