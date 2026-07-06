// Local-file DataProvider: the zero-dependency default.
//
// State lives under app/.data/ as JSON handoff files (snapshot.json,
// onboarding.json, agent.lock) with config resolved from config.local.json /
// KELLY_FAMILY_OFFICE_CONFIG / config.example.json. This is the offline
// reference implementation of the same read-mostly dashboard model Busabase
// serves remotely, so KELLY_FAMILY_OFFICE_DATA_PROVIDER=local|busabase is a
// config switch, not a rewrite of the UI or scripts.
//
// The fs logic here is lifted verbatim from the previous app/server/store.ts, so
// the same bytes land in the same paths and GET /api/state is unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, lockPath, onboardingPath, skillDir, snapshotPath } from "../paths.ts";
import type {
  Config,
  ConfigResult,
  ConfigSummary,
  ConsolidatedSnapshot,
  FamilyOfficeState,
  ProviderMeta,
} from "../types.ts";

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
  if (process.env.KELLY_FAMILY_OFFICE_CONFIG) paths.push(process.env.KELLY_FAMILY_OFFICE_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-family-office", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getState(): Promise<FamilyOfficeState> {
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
          "KELLY_FAMILY_OFFICE_CONFIG",
          "skills/kelly-family-office/config.local.json",
          "~/.config/kelly-family-office/config.json",
        ],
      };
    },

    async readSnapshot(): Promise<ConsolidatedSnapshot> {
      return readJson(snapshotPath, emptySnapshot());
    },

    async writeSnapshot(snapshot: ConsolidatedSnapshot): Promise<{ ok: boolean; path?: string | null }> {
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
      return { config: { entities: [], institutions: [] }, path: "", is_example: false };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
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
    },
  };
}
