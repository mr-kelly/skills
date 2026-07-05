import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_TARGET_ALLOCATION, computeInsights } from "./insights.ts";
import { DATA_DIR, LOCK_PATH, ONBOARDING_PATH, SKILL_DIR, SNAPSHOT_PATH } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, Onboarding, PortfolioSnapshot, TargetAllocation } from "./types.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readSnapshot(): Promise<PortfolioSnapshot> {
  return (await readJson<PortfolioSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as PortfolioSnapshot;
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<unknown> {
  return readJson(LOCK_PATH, null);
}

export function emptySnapshot(): PortfolioSnapshot {
  return {
    schema_version: "1",
    snapshot_id: "",
    generated_at: new Date(0).toISOString(),
    source: "kelly-invest-webull",
    base_currency: "USD",
    accounts: [],
    positions: [],
    totals: {
      market_value: 0,
      cost_basis: 0,
      unrealized_pnl: 0,
      unrealized_pnl_pct: 0,
      day_change: 0,
      day_change_pct: 0,
      total_cash: 0,
    },
    allocation: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No portfolio snapshot exists yet. Connect Webull, then run a read-only sync.",
      },
    ],
  };
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_INVEST_WEBULL_CONFIG) paths.push(process.env.KELLY_INVEST_WEBULL_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-invest-webull", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_INVEST_WEBULL_ENV_FILE) paths.push(process.env.KELLY_INVEST_WEBULL_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-invest-webull", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function targetAllocationFromConfig(configResult: ConfigResult | undefined): TargetAllocation {
  const target = configResult?.config?.target_allocation;
  return target && typeof target === "object" && !Array.isArray(target) ? target : DEFAULT_TARGET_ALLOCATION;
}

// Attach deterministic, read-only insights to a snapshot for the state payload.
// Pure with respect to storage: it only computes from the snapshot + config.
export function attachInsights(snapshot: PortfolioSnapshot, configResult: ConfigResult): PortfolioSnapshot {
  if (!snapshot) return snapshot;
  snapshot.insights = computeInsights(snapshot, targetAllocationFromConfig(configResult));
  return snapshot;
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const webull = config.webull || {};
  const secretEnvs = ["app_key_env", "app_secret_env"].map((key) => webull[key]).filter(Boolean);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    webull: {
      region: webull.region || "",
      base_url: webull.base_url || "",
      account_allowlist: Array.isArray(webull.account_allowlist) ? webull.account_allowlist : [],
      secret_envs: secretEnvs,
      secrets_ready: secretEnvs.length > 0 && secretEnvs.every((name) => Boolean(process.env[name])),
    },
  };
}
