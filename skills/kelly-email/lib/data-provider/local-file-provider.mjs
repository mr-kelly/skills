import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT_DIR, SKILL_DIR } from "../paths.mjs";

export const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");
export const LEGACY_CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.yml");
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.json");
export const LEGACY_CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.yml");
export const REPO_ENV_PATH = path.join(ROOT_DIR, ".env");
export const SKILL_ENV_PATH = path.join(SKILL_DIR, ".env.local");
export const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "kelly-email");
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.json");
export const LEGACY_USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.yml");
export const USER_ENV_PATH = path.join(USER_CONFIG_DIR, ".env");

export function envFileCandidates() {
  return [process.env.KELLY_EMAIL_ENV_FILE, REPO_ENV_PATH, SKILL_ENV_PATH, USER_ENV_PATH].filter(Boolean);
}

export function configFileCandidates() {
  return [process.env.KELLY_EMAIL_CONFIG, CONFIG_LOCAL_PATH, USER_CONFIG_PATH, CONFIG_EXAMPLE_PATH].filter(Boolean);
}

export function privateConfigCandidates() {
  return [process.env.KELLY_EMAIL_CONFIG, CONFIG_LOCAL_PATH, USER_CONFIG_PATH].filter(Boolean);
}

export function legacyConfigFileCandidates() {
  return [LEGACY_CONFIG_LOCAL_PATH, LEGACY_USER_CONFIG_PATH, LEGACY_CONFIG_EXAMPLE_PATH].filter(Boolean);
}

async function loadDotenvFile(pathname) {
  if (!existsSync(pathname)) return false;
  const text = await fs.readFile(pathname, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

export async function loadDotenv() {
  const loaded = [];
  for (const pathname of envFileCandidates()) {
    if (await loadDotenvFile(pathname)) loaded.push(pathname);
  }
  return loaded;
}

export async function loadConfigWithMeta() {
  const candidates = configFileCandidates();
  const source = candidates.find((candidate) => existsSync(candidate));
  const legacyCandidates = legacyConfigFileCandidates();
  const legacySource = legacyCandidates.find((candidate) => existsSync(candidate));
  const sourceIsLegacy = Boolean(source && /\.(ya?ml)$/i.test(source));
  const baseMeta = {
    reader: "local",
    provider: "local_file",
    candidates,
    legacy_candidates: legacyCandidates,
    legacy_source: sourceIsLegacy ? source : legacySource || "",
    recommended_config: USER_CONFIG_PATH,
    recommended_env: USER_ENV_PATH,
    example_config: CONFIG_EXAMPLE_PATH,
    legacy_config_format: Boolean(sourceIsLegacy || legacySource),
  };
  if (!source || sourceIsLegacy) {
    return {
      config: { mailboxes: [], identities: [] },
      source: "",
      is_example: false,
      has_private_config: false,
      ...baseMeta,
    };
  }
  const parsed = JSON.parse(await fs.readFile(source, "utf8")) || {};
  if (!Array.isArray(parsed.mailboxes)) parsed.mailboxes = [];
  if (!Array.isArray(parsed.identities)) parsed.identities = [];
  const isExample = path.resolve(source) === path.resolve(CONFIG_EXAMPLE_PATH);
  return {
    config: isExample ? { mailboxes: [], identities: [] } : parsed,
    source,
    is_example: isExample,
    has_private_config: !isExample && privateConfigCandidates().some((candidate) => existsSync(candidate)),
    ...baseMeta,
  };
}
