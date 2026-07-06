// Config + env loading, shared by the data-provider selector and the providers.
// This is the layered private-config pattern from the App-in-Skill spec: search
// KELLY_CAMPAIGNS_CONFIG -> config.local.json -> ~/.config -> config.example.json,
// then expose only a sanitized summary (never secrets) to /api/state.

import fs from "node:fs/promises";
import path from "node:path";
import { skillDir } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";

export async function readJson(file: string, fallback: unknown = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_CAMPAIGNS_CONFIG) paths.push(process.env.KELLY_CAMPAIGNS_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-campaigns", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_CAMPAIGNS_ENV_FILE) paths.push(process.env.KELLY_CAMPAIGNS_ENV_FILE);
  paths.push(path.resolve(skillDir, "..", "..", ".env"));
  paths.push(path.join(skillDir, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-campaigns", ".env"));
  return paths;
}

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

export async function loadConfig(): Promise<ProviderMeta> {
  for (const file of configSearchPaths()) {
    const config = (await readJson(file, null)) as Config | null;
    if (config) return { config, source: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { from_identities: [], segments: [] }, source: "", is_example: false };
}

// Sanitized config summary — the exact shape summarizeConfig() produced in the
// original store.ts, so /api/state.config_summary is unchanged.
export function summarizeConfig(meta: ProviderMeta = {}): Record<string, unknown> {
  const config = (meta.config || {}) as Config & Record<string, Record<string, unknown> | unknown[]>;
  const operator = (config.operator as Record<string, unknown>) || {};
  const brand = (config.brand as Record<string, unknown>) || {};
  const esp = (config.esp as Record<string, unknown>) || {};
  const policy = (config.sending_policy as Record<string, unknown>) || {};
  const style = (config.style as Record<string, unknown>) || {};
  const identities = Array.isArray(config.from_identities) ? config.from_identities : [];
  const segments = Array.isArray(config.segments) ? config.segments : [];
  const espSecretKeys = ["api_key_env", "token_env", "password_env"].filter((key) => esp[key]);
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    brand: {
      name: brand.name || "",
      homepage: brand.homepage || "",
      unsubscribe_url: brand.unsubscribe_url || "",
    },
    esp: {
      provider: esp.provider || "",
      display_name: esp.display_name || esp.provider || "",
      secret_envs: espSecretKeys.map((key) => esp[key]),
      secrets_ready: espSecretKeys.length > 0 && espSecretKeys.every((key) => Boolean(process.env[String(esp[key])])),
    },
    from_identities: identities.map((raw) => {
      const identity = raw as Record<string, unknown>;
      return {
        identity_id: identity.identity_id || "",
        from_name: identity.from_name || "",
        from_email: identity.from_email || "",
        reply_to: identity.reply_to || "",
        use_when: Array.isArray(identity.use_when) ? identity.use_when : [],
      };
    }),
    segments: segments.map((raw) => {
      const segment = raw as Record<string, unknown>;
      return {
        segment_id: segment.segment_id || "",
        name: segment.name || segment.segment_id || "",
        description: segment.description || "",
      };
    }),
    sending_policy: {
      approval_required: policy.approval_required !== false,
      daily_send_cap: Number(policy.daily_send_cap || 0),
      hourly_send_cap: Number(policy.hourly_send_cap || 0),
      min_inbox_readiness: Number(policy.min_inbox_readiness || 0),
      max_spam_score: Number(policy.max_spam_score || 0),
    },
    style_tone: style.tone || "",
  };
}
