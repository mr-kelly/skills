import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, LOCK_PATH, ONBOARDING_PATH, SKILL_DIR, SNAPSHOT_PATH } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, ConsolidatedSnapshot } from "./types.ts";

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T = unknown>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readSnapshot(): Promise<ConsolidatedSnapshot> {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readOnboarding(): Promise<Record<string, unknown>> {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock(): Promise<Record<string, unknown> | null> {
  return readJson(LOCK_PATH, null);
}

export function emptySnapshot(): ConsolidatedSnapshot {
  return {
    schema_version: "1",
    snapshot_id: "empty",
    generated_at: new Date(0).toISOString(),
    source: "kelly-family-office",
    base_currency: "USD",
    fx_rates: { USD: 1 },
    entities: [],
    accounts: [],
    holdings: [],
    totals: {
      aum_base: 0,
      cost_basis_base: 0,
      unrealized_pnl_base: 0,
      unrealized_pnl_pct: 0,
    },
    by_entity: [],
    by_asset_class: [],
    by_institution: [],
    insights: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No holdings snapshot exists yet. Define entities, then import a holdings CSV or maintain holdings manually.",
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
  const paths = [];
  if (process.env.KELLY_FAMILY_OFFICE_CONFIG) paths.push(process.env.KELLY_FAMILY_OFFICE_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-office", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths = [];
  if (process.env.KELLY_FAMILY_OFFICE_ENV_FILE) paths.push(process.env.KELLY_FAMILY_OFFICE_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-office", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config | null>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { entities: [], institutions: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const entities = Array.isArray(config.entities) ? config.entities : [];
  const institutions = Array.isArray(config.institutions) ? config.institutions : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    fx_rates: config.fx_rates || { USD: 1 },
    entities: entities.map((entity) => ({
      entity_id: entity.entity_id || "",
      name: entity.name || entity.entity_id || "",
      type: entity.type || "",
      member: entity.member || "",
    })),
    institutions,
  };
}
