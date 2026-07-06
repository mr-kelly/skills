// Config + env loading shared by the data-provider layer and the launcher.
// Lifted verbatim from the original app/server/store.ts so behavior and the
// sanitized `/api/state` config summary are unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { ConfigResult } from "./types.ts";

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
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
  if (process.env.KELLY_CREATORS_CONFIG) paths.push(process.env.KELLY_CREATORS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-creators", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_CREATORS_ENV_FILE) paths.push(process.env.KELLY_CREATORS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-creators", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { platforms: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult) {
  const config = configResult.config || {};
  const platforms = Array.isArray(config.platforms) ? config.platforms : [];
  const operator = config.operator || {};
  const program = config.program || {};
  const brands = Array.isArray(config.brands) ? config.brands : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    program: {
      base_currency: program.base_currency || "USD",
      budget_total: Number(program.budget_total || 0),
      target_niches: Array.isArray(program.target_niches) ? program.target_niches : [],
    },
    brands: brands.map((brand) => ({
      brand_id: brand.brand_id || "",
      display_name: brand.display_name || brand.brand_id || "",
      positioning: brand.positioning || "",
    })),
    style_tone: config.style?.tone || "",
    platforms: platforms.map((platform) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => platform[key]);
      const secretEnv = (key: string) => String(platform[key] || "");
      return {
        platform_id: platform.platform_id || "",
        type: platform.type || "",
        display_name: platform.display_name || platform.platform_id || "",
        handoff_skill: platform.handoff_skill || "",
        secret_envs: secretKeys.map(secretEnv),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[secretEnv(key)])),
      };
    }),
  };
}
