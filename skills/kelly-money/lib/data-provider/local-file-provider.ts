// Local-file DataProvider: the zero-dependency default.
//
// State lives under app/.data/ as JSON handoff files (ledger_snapshot.json,
// onboarding.json, agent.lock) with config resolved from config.local.json /
// KELLY_MONEY_CONFIG / config.example.json. This is the offline reference
// implementation of the same read-mostly dashboard model Busabase serves
// remotely, so KELLY_MONEY_DATA_PROVIDER=local|busabase is a config switch, not
// a rewrite of the UI or scripts.
//
// The fs logic here is lifted verbatim from the previous app/server/store.ts, so
// the same bytes land in the same paths and GET /api/state is unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, ledgerPath, lockPath, onboardingPath, skillDir } from "../paths.ts";
import type {
  Config,
  ConfigAccount,
  ConfigResult,
  ConfigSummary,
  LedgerSnapshot,
  MoneyState,
  ProviderMeta,
} from "../types.ts";

export function emptySnapshot(): LedgerSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-money",
    base_currency: "USD",
    range: { start: "", end: "" },
    metrics: {
      account_count: 0,
      transaction_count: 0,
      gross_inflow: 0,
      gross_outflow: 0,
      fees: 0,
      net: 0,
    },
    accounts: [],
    transactions: [],
    invoices: [],
    invoice_matches: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No ledger snapshot exists yet. Configure accounts, then run a read-only sync.",
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
  const paths: string[] = [];
  if (process.env.KELLY_MONEY_CONFIG) paths.push(process.env.KELLY_MONEY_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getState(): Promise<MoneyState> {
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
          "KELLY_MONEY_CONFIG",
          "skills/kelly-money/config.local.json",
          "~/.config/kelly-money/config.json",
        ],
      };
    },

    async readSnapshot(): Promise<LedgerSnapshot> {
      return readJson(ledgerPath, emptySnapshot());
    },

    async writeSnapshot(snapshot: LedgerSnapshot): Promise<{ ok: boolean; path?: string | null }> {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(ledgerPath, JSON.stringify(snapshot, null, 2));
      return { ok: true, path: ledgerPath };
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
      return { config: { accounts: [] }, path: "", is_example: false };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
      const accounts: ConfigAccount[] = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
      return {
        config_path: configResult.path,
        is_example: configResult.is_example,
        accounts: accounts.map((account) => {
          const secretKeys = ["api_key_env", "client_id_env", "client_secret_env", "token_env"].filter(
            (key) => account[key],
          );
          return {
            account_id: account.account_id || "",
            provider: account.provider || "",
            display_name: account.display_name || account.account_id || "",
            entity: account.entity || "",
            currency: account.currency || "",
            secret_envs: secretKeys.map((key) => account[key] as string),
            secrets_ready: secretKeys.every((key) => Boolean(process.env[account[key] as string])),
          };
        }),
      };
    },
  };
}
