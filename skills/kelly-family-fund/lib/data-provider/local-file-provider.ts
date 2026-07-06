// Local-file FundProvider: the zero-dependency default.
//
// The fund snapshot and handoff markers live under app/.data/ as JSON, exactly
// where the original app/server/store.ts read and wrote them. This provider is
// the offline reference implementation of the same read-mostly dashboard model
// the Busabase provider serves remotely, so KELLY_FAMILY_FUND_DATA_PROVIDER=
// local|busabase is a config switch, not a rewrite of the UI or scripts.

import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, IMPORT_REPORT_PATH, LOCK_PATH, ONBOARDING_PATH, SNAPSHOT_PATH } from "../paths.ts";
import type { Config, ConfigResult, ConfigSummary, FundProvider, FundSnapshot, ProviderMeta } from "../types.ts";
import type { FundState } from "./provider-interface.ts";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
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

export function createLocalFileProvider(meta: ProviderMeta = {}): FundProvider {
  const configResult: ConfigResult = {
    config: (meta.config as Config) || { beneficiaries: [], families: [] },
    path: meta.source || "",
    is_example: Boolean(meta.is_example),
  };

  return {
    kind: "local",

    async getConfig() {
      return configResult;
    },

    async getConfigSummary() {
      return summarizeConfig(configResult);
    },

    async getSnapshot() {
      return readJson<FundSnapshot>(SNAPSHOT_PATH, emptySnapshot());
    },

    async getOnboarding() {
      return readJson<Record<string, unknown>>(ONBOARDING_PATH, { completed: false });
    },

    async getLock() {
      return readJson<Record<string, unknown> | null>(LOCK_PATH, null);
    },

    async getState(): Promise<FundState> {
      const [snapshot, onboarding, lock] = await Promise.all([
        this.getSnapshot(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async putSnapshot(snapshot: FundSnapshot) {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeJson(SNAPSHOT_PATH, snapshot);
      return { ok: true, snapshot_id: snapshot.snapshot_id };
    },

    async putImportReport(report: Record<string, unknown>) {
      await writeJson(IMPORT_REPORT_PATH, report);
      return { ok: true };
    },
  };
}
