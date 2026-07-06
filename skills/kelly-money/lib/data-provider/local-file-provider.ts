// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON files written by the read-only sync scripts.
// This provider is the offline reference implementation of the same dashboard
// surface Busabase serves remotely, so KELLY_MONEY_DATA_PROVIDER=local|busabase
// is a config switch, not a rewrite of the UI or scripts. The fs read logic here
// is the original app/server/store.ts, moved behind the provider seam unchanged,
// so /api/state stays byte-identical.

import fs from "node:fs/promises";
import { DATA_DIR, LEDGER_PATH, LOCK_PATH, ONBOARDING_PATH } from "../paths.ts";
import type {
  AppState,
  Config,
  ConfigAccount,
  ConfigResult,
  ConfigSummary,
  LedgerSnapshot,
  Onboarding,
  ProviderMeta,
} from "../types.ts";

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  const configResult: ConfigResult = {
    config: meta.config || { accounts: [] },
    path: meta.config_path || "",
    is_example: Boolean(meta.is_example),
  };

  const provider = {
    kind: "local",

    async getState(): Promise<AppState> {
      const [snapshot, onboarding, lock] = await Promise.all([
        this.getSnapshot(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        app: "kelly-money",
        data_provider: process.env.KELLY_MONEY_DATA_PROVIDER || configResult.config.data_provider || "local",
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async getSnapshot(): Promise<LedgerSnapshot> {
      return (await readJson<LedgerSnapshot>(LEDGER_PATH, emptySnapshot())) as LedgerSnapshot;
    },

    async getOnboarding(): Promise<Onboarding> {
      return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
    },

    async getLock(): Promise<unknown> {
      return readJson(LOCK_PATH, null);
    },

    async getConfigSummary(): Promise<ConfigSummary> {
      return summarizeConfig(configResult);
    },
  };

  return provider;
}

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

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
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
}
