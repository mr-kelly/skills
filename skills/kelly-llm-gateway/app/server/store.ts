import fs from "node:fs/promises";
import path from "node:path";
import { buildSnapshot } from "../../lib/data-provider/seed-data.ts";
import { DEFAULT_COST_SPIKE_THRESHOLD_PCT, DEFAULT_ERROR_SPIKE_THRESHOLD_PCT, computeAnomalies } from "./anomalies.ts";
import { readDecisions } from "./decisions.ts";
import { DATA_DIR, LOCK_PATH, ONBOARDING_PATH, SKILL_DIR, SNAPSHOT_PATH } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, Decisions, GatewaySnapshot, Onboarding } from "./types.ts";

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

export function emptySnapshot(): GatewaySnapshot {
  return {
    schema_version: "1",
    snapshot_id: "",
    generated_at: new Date(0).toISOString(),
    source: "kelly-llm-gateway",
    base_currency: "USD",
    services: [],
    models: [],
    routes: [],
    totals: { calls_today: 0, cost_today: 0, cost_7d_avg: 0, error_rate_today: 0 },
    spend_trend: [],
    anomalies: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No gateway snapshot exists yet. Run scripts/seed_snapshot.ts to seed one.",
      },
    ],
  };
}

export async function readSnapshot(): Promise<GatewaySnapshot> {
  const snapshot = await readJson<GatewaySnapshot>(SNAPSHOT_PATH, null);
  return snapshot || emptySnapshot();
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<unknown> {
  return readJson(LOCK_PATH, null);
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
  if (process.env.KELLY_LLM_GATEWAY_CONFIG) paths.push(process.env.KELLY_LLM_GATEWAY_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-llm-gateway", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_LLM_GATEWAY_ENV_FILE) paths.push(process.env.KELLY_LLM_GATEWAY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-llm-gateway", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const gateway = config.gateway || {};
  const secretEnvs = ["api_key_env"]
    .map((key) => (gateway as Record<string, unknown>)[key])
    .filter(Boolean) as string[];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    gateway: {
      region: gateway.region || "",
      base_url: gateway.base_url || "",
      secret_envs: secretEnvs,
      secrets_ready: secretEnvs.length > 0 && secretEnvs.every((name) => Boolean(process.env[name])),
    },
  };
}

// Merge decisions (rollout notes, anomaly acks) and computed anomalies into the
// snapshot for the /api/state payload. Pure with respect to storage beyond the
// one decisions read; does not mutate app/.data/snapshot.json.
export async function attachDerived(snapshot: GatewaySnapshot, configResult: ConfigResult): Promise<GatewaySnapshot> {
  if (!snapshot) return snapshot;
  const decisions = await readDecisions();
  const config = configResult.config || {};
  const costThreshold = Number(config.cost_spike_threshold_pct ?? DEFAULT_COST_SPIKE_THRESHOLD_PCT);
  const errorThreshold = Number(config.error_spike_threshold_pct ?? DEFAULT_ERROR_SPIKE_THRESHOLD_PCT);
  const anomalies = computeAnomalies(snapshot, costThreshold, errorThreshold).map((anomaly) => {
    const ack = decisions.anomaly_acks[anomaly.id];
    return ack
      ? { ...anomaly, status: "acknowledged" as const, acknowledged_at: ack.acknowledged_at, ack_note: ack.note }
      : anomaly;
  });
  snapshot.anomalies = anomalies;
  snapshot.routes = snapshot.routes.map((route) => {
    const decision = decisions.rollouts[route.route_id];
    if (!decision) return route;
    const overlay: Partial<typeof route> = { note: decision.note || route.note };
    if (decision.action === "promote") {
      overlay.status = "stable";
      overlay.canary_pct = 100;
      overlay.rollback_ready = false;
    } else if (decision.action === "rollback") {
      overlay.status = "rollback";
      overlay.rollback_ready = false;
    } else if (decision.action === "hold") {
      overlay.status = "hold";
    }
    return { ...route, ...overlay };
  });
  return snapshot;
}

export { readDecisions };
export type { Decisions };
