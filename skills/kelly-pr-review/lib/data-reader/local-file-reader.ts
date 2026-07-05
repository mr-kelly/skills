import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigMeta, ReviewConfig } from "../../app/server/types.ts";
import { pathExists } from "../common.ts";
import { ROOT_DIR, SKILL_DIR } from "../paths.ts";

export const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.json");
export const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "kelly-pr-review");
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.json");
export const LEGACY_CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.yml");
export const LEGACY_CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.yml");
export const LEGACY_USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.yml");

const CONFIG_CANDIDATES = [
  () => process.env.KELLY_PR_REVIEW_CONFIG,
  () => CONFIG_LOCAL_PATH,
  () => USER_CONFIG_PATH,
  () => CONFIG_EXAMPLE_PATH,
];

const LEGACY_CONFIG_CANDIDATES = [
  () => LEGACY_CONFIG_LOCAL_PATH,
  () => LEGACY_USER_CONFIG_PATH,
  () => LEGACY_CONFIG_EXAMPLE_PATH,
];

const ENV_CANDIDATES = [
  () => process.env.KELLY_PR_REVIEW_ENV_FILE,
  () => path.join(ROOT_DIR, ".env"),
  () => path.join(SKILL_DIR, ".env.local"),
  () => path.join(os.homedir(), ".config", "kelly-pr-review", ".env"),
];

async function loadEnvFile(pathname) {
  if (!pathname || !(await pathExists(pathname))) return false;
  const raw = await fs.readFile(pathname, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

export async function loadDotenvFiles() {
  const loaded = [];
  for (const candidate of ENV_CANDIDATES) {
    const pathname = candidate();
    if (await loadEnvFile(pathname)) loaded.push(pathname);
  }
  return loaded;
}

export async function loadLocalConfig() {
  await loadDotenvFiles();
  let source = "";
  let config: ReviewConfig = {};
  let exampleOnly = false;
  let legacySource = "";
  for (const candidate of CONFIG_CANDIDATES) {
    const pathname = candidate();
    if (!pathname || !(await pathExists(pathname))) continue;
    source = pathname;
    config = JSON.parse(await fs.readFile(pathname, "utf8")) || {};
    exampleOnly = path.resolve(pathname) === path.resolve(CONFIG_EXAMPLE_PATH);
    if (exampleOnly) config = {};
    break;
  }
  if (!source) {
    for (const candidate of LEGACY_CONFIG_CANDIDATES) {
      const pathname = candidate();
      if (pathname && (await pathExists(pathname))) {
        legacySource = pathname;
        break;
      }
    }
  }
  const repos = (config.repos || []).filter((repo) => repo.include !== false && repo.repo);
  const configured = !legacySource;
  const defaultMode = exampleOnly || !source || !repos.length;
  const onboarding = legacySource
    ? {
        configured: false,
        state: "legacy_config_format",
        message: `Found legacy YAML config at ${legacySource}, but Kelly PR Review now reads JSON only. Convert it to ${USER_CONFIG_PATH} or set KELLY_PR_REVIEW_CONFIG to a JSON file.`,
      }
    : !defaultMode
      ? { configured: true, state: "ready", message: "Kelly PR Review is configured." }
      : {
          configured: true,
          state: "gh_defaults",
          message:
            "Using gh CLI defaults: review requests for the current authenticated account across accessible repositories.",
        };
  return {
    reader: "local",
    configured,
    config,
    source,
    legacy_source: legacySource,
    example_only: exampleOnly,
    default_mode: defaultMode,
    onboarding,
  };
}

export function publicConfigSummary(meta: ConfigMeta) {
  const config = meta.config || {};
  return {
    reader: meta.reader || "local",
    configured: Boolean(meta.configured),
    source: meta.source || "",
    default_mode: Boolean(meta.default_mode),
    onboarding: meta.onboarding || {},
    reviewer: {
      handle: config.reviewer?.handle || "@me",
      display_name: config.reviewer?.display_name || "",
    },
    repos: (config.repos || []).map((repo) => ({
      repo: repo.repo,
      label: repo.label || repo.repo,
      include: repo.include !== false,
    })),
    query: config.query || {},
    review_policy: {
      default_action: config.review_policy?.default_action || "comment",
      include_patch_excerpt: Boolean(config.review_policy?.include_patch_excerpt),
      max_patch_chars: config.review_policy?.max_patch_chars || 12000,
      large_diff_changed_files: config.review_policy?.large_diff_changed_files || 25,
      large_diff_additions: config.review_policy?.large_diff_additions || 1500,
    },
    style: config.style || {},
  };
}
