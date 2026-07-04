import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, LEDGER_PATH, LOCK_PATH, ONBOARDING_PATH, SKILL_DIR } from "./paths.mjs";

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readSnapshot() {
  return readJson(LEDGER_PATH, emptySnapshot());
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export function emptySnapshot() {
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

export async function loadDotenvFiles(files) {
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
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_MONEY_CONFIG) paths.push(process.env.KELLY_MONEY_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_MONEY_ENV_FILE) paths.push(process.env.KELLY_MONEY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-money", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
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
        secret_envs: secretKeys.map((key) => account[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[account[key]])),
      };
    }),
  };
}
