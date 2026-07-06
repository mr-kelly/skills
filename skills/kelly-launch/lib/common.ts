// Shared helpers for the kelly-launch data-provider layer, its scripts, and the
// local server bootstrap.
//
// These are the runtime-neutral pieces the original app/server/store.ts exposed
// that are NOT the per-request read/write model (that moved into
// data-provider/*): JSON IO, config discovery + summary, the .env loader, and
// the data-dir bootstrap. Keeping them here (beside the providers) lets
// app/server/index.ts drop its dependency on store.ts entirely.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only,
// NO build step.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, skillDir } from "./paths.ts";
import type { Channel, Config, ConfigResult, PressList } from "./types.ts";

export async function readJson(file: string, fallback: unknown = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Ensure app/.data/ exists before the server or a script writes into it.
export async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
}

// Minimal .env loader: first definition wins, real environment always wins.
export async function loadDotenvFiles(files: string[]) {
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

export function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_LAUNCH_CONFIG) paths.push(process.env.KELLY_LAUNCH_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_LAUNCH_ENV_FILE) paths.push(process.env.KELLY_LAUNCH_ENV_FILE);
  paths.push(path.resolve(skillDir, "..", "..", ".env"));
  paths.push(path.join(skillDir, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { channels: [] }, path: "", is_example: false };
}

// Sanitized config summary shared by both providers and /api/state. Never emits
// secret values, only the env-var names guarding each channel and whether they
// resolve at runtime.
export function summarizeConfig(meta: ProviderMetaLike) {
  const config: Config = meta.config || {};
  const channels: Channel[] = Array.isArray(config.channels) ? config.channels : [];
  const product = (config.product || {}) as Record<string, unknown>;
  const launch = (config.launch || {}) as Record<string, unknown>;
  const pressLists: PressList[] = Array.isArray(config.press_lists) ? config.press_lists : [];
  const readinessPolicy = config.readiness_policy || {};
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    product: {
      name: (product.name as string) || "",
      tagline: (product.tagline as string) || "",
      homepage: (product.homepage as string) || "",
      category: (product.category as string) || "",
    },
    launch: {
      target_date: (launch.target_date as string) || "",
      timezone: (launch.timezone as string) || "UTC",
    },
    style_tone: config.style?.tone || "",
    press_lists: pressLists.map((list) => ({
      list_id: list.list_id || "",
      display_name: list.display_name || list.list_id || "",
    })),
    readiness_policy: {
      block_on: Array.isArray(readinessPolicy.block_on) ? readinessPolicy.block_on : [],
      min_ship_ratio: typeof readinessPolicy.min_ship_ratio === "number" ? readinessPolicy.min_ship_ratio : null,
    },
    channels: channels.map((channel) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        handoff_skill: channel.handoff_skill || "",
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key] as string])),
      };
    }),
  };
}

// Structural subset of ProviderMeta used by summarizeConfig; kept local to avoid
// a circular import back through types when providers pass their own meta.
interface ProviderMetaLike {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}
