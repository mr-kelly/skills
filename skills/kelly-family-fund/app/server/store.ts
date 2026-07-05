import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, LOCK_PATH, ONBOARDING_PATH, SKILL_DIR, SNAPSHOT_PATH } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, FundSnapshot } from "./types.ts";

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

export async function readSnapshot(): Promise<FundSnapshot> {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readOnboarding(): Promise<Record<string, unknown>> {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock(): Promise<Record<string, unknown> | null> {
  return readJson(LOCK_PATH, null);
}

export function emptySnapshot(): FundSnapshot {
  return {
    schema_version: "1",
    snapshot_id: "empty",
    generated_at: new Date(0).toISOString(),
    base_currency: "CNY",
    fund: { name: "", steward: "", note: "" },
    beneficiaries: [],
    families: [],
    income: [],
    expenses: [],
    months: [],
    totals: {
      income_total: 0,
      expense_total: 0,
      balance: 0,
      care_total: 0,
      family_total: 0,
      avg_family_benefit: 0,
    },
    by_category: [],
    by_family: [],
    insights: [],
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
  if (process.env.KELLY_FAMILY_FUND_CONFIG) paths.push(process.env.KELLY_FAMILY_FUND_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-fund", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths = [];
  if (process.env.KELLY_FAMILY_FUND_ENV_FILE) paths.push(process.env.KELLY_FAMILY_FUND_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-fund", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config | null>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { beneficiaries: [], families: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const beneficiaries = Array.isArray(config.beneficiaries) ? config.beneficiaries : [];
  const families = Array.isArray(config.families) ? config.families : [];
  const fund = config.fund || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "CNY",
    fund: {
      name: fund.name || "",
      steward: fund.steward || "",
      note: fund.note || "",
    },
    beneficiaries: beneficiaries.map((b) => ({
      id: b.id || "",
      name: b.name || b.id || "",
      relation: b.relation || "",
      pension_monthly: Number(b.pension_monthly) || 0,
    })),
    families: families.map((f) => ({
      id: f.id || "",
      name: f.name || f.id || "",
      head: f.head || "",
      members_count: Number(f.members_count) || 0,
    })),
    deviation_threshold_pct: Number(config.fairness?.deviation_threshold_pct) || 20,
  };
}
