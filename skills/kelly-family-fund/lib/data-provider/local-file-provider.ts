// Local-file DataProvider: the zero-dependency default.
//
// State lives under app/.data/ as JSON handoff files (snapshot.json,
// onboarding.json, agent.lock) with config resolved from config.local.json /
// KELLY_FAMILY_FUND_CONFIG / config.example.json. This is the offline reference
// implementation of the same read-mostly dashboard model Busabase serves
// remotely, so KELLY_FAMILY_FUND_DATA_PROVIDER=local|busabase is a config
// switch, not a rewrite of the UI or scripts.
//
// The fs logic here is lifted verbatim from the previous app/server/store.ts, so
// the same bytes land in the same paths and GET /api/state is unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, lockPath, onboardingPath, skillDir, snapshotPath } from "../paths.ts";
import type { Config, ConfigResult, ConfigSummary, FamilyFundState, FundSnapshot, ProviderMeta } from "../types.ts";

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

async function readJson<T = unknown>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

function configSearchPaths(): string[] {
  const paths = [];
  if (process.env.KELLY_FAMILY_FUND_CONFIG) paths.push(process.env.KELLY_FAMILY_FUND_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-fund", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getState(): Promise<FamilyFundState> {
      const [snapshot, onboarding, lock, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
      ]);
      return {
        onboarding,
        lock,
        config_summary: this.summarizeConfig(configResult),
        snapshot,
      };
    },

    configSummary() {
      return {
        provider: "local",
        config_paths: [
          "KELLY_FAMILY_FUND_CONFIG",
          "skills/kelly-family-fund/config.local.json",
          "~/.config/kelly-family-fund/config.json",
        ],
      };
    },

    async readSnapshot(): Promise<FundSnapshot> {
      return readJson(snapshotPath, emptySnapshot());
    },

    async writeSnapshot(snapshot: FundSnapshot): Promise<{ ok: boolean; path?: string | null }> {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
      return { ok: true, path: snapshotPath };
    },

    async readOnboarding(): Promise<Record<string, unknown>> {
      return readJson(onboardingPath, { completed: false });
    },

    async readLock(): Promise<Record<string, unknown> | null> {
      return readJson(lockPath, null);
    },

    async readConfig(): Promise<ConfigResult> {
      for (const file of configSearchPaths()) {
        const config = await readJson<Config | null>(file, null);
        if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
      }
      return { config: { beneficiaries: [], families: [] }, path: "", is_example: false };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
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
    },
  };
}
