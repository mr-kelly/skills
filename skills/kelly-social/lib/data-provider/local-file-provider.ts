// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON files (social_snapshot.json,
// onboarding.json, agent.lock). This provider is the offline reference
// implementation, holding the exact fs logic that used to live in
// app/server/store.ts, reading the SAME paths — so KELLY_SOCIAL_DATA_PROVIDER=
// local|busabase is a config switch, not a rewrite of the UI or scripts, and
// /api/state stays byte-identical to the pre-refactor server.

import fs from "node:fs/promises";
import { lockPath, onboardingPath, snapshotPath } from "../paths.ts";
import type {
  AccountConfig,
  ConfigSummary,
  Lock,
  Onboarding,
  ProviderMeta,
  SocialSnapshot,
  SocialState,
} from "../types.ts";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

// The empty-snapshot shape a fresh install returns until the agent collects one.
// Kept byte-identical to the original store.emptySnapshot().
export function emptySnapshot(): SocialSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-social",
    range: { start: "", end: "" },
    metrics: {
      account_count: 0,
      post_count: 0,
      total_followers: 0,
      followers_delta_7d: 0,
      followers_delta_28d: 0,
      impressions_7d: 0,
      engagements_7d: 0,
      engagement_rate_7d: 0,
    },
    accounts: [],
    posts: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No social snapshot exists yet. Configure accounts, then ask the agent to collect a snapshot.",
      },
    ],
  };
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  const config = meta.config || { accounts: [] };
  const configPath = meta.source || "";
  const isExample = Boolean(meta.is_example);

  return {
    kind: "local",

    async getSnapshot(): Promise<SocialSnapshot> {
      return readJson(snapshotPath, emptySnapshot());
    },

    async getOnboarding(): Promise<Onboarding> {
      return readJson(onboardingPath, { completed: false });
    },

    async getLock(): Promise<Lock | null> {
      return readJson<Lock | null>(lockPath, null);
    },

    getConfigSummary(): ConfigSummary {
      const accounts: AccountConfig[] = Array.isArray(config.accounts) ? config.accounts : [];
      // Key order (config_path, is_example, accounts) is preserved to keep
      // /api/state byte-identical to the pre-refactor server. The provider name
      // is surfaced at the top level of the state payload as `data_provider`.
      return {
        config_path: configPath,
        is_example: isExample,
        accounts: accounts.map((account) => {
          const secretKeys = ["api_token_env", "api_key_env", "api_secret_env", "access_token_env"].filter(
            (key) => account[key],
          );
          return {
            account_id: account.account_id || "",
            platform: account.platform || "",
            handle: account.handle || "",
            display_name: account.display_name || account.handle || account.account_id || "",
            collection: account.collection || "browser_agent",
            secret_envs: secretKeys.map((key) => String(account[key])),
            secrets_ready: secretKeys.every((key) => Boolean(process.env[String(account[key])])),
          };
        }),
      };
    },

    async getState(): Promise<SocialState> {
      const [snapshot, onboarding, lock] = await Promise.all([
        this.getSnapshot(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        data_provider: "local",
        onboarding,
        lock,
        config_summary: this.getConfigSummary(),
        snapshot,
      };
    },
  };
}
