import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { ROOT_DIR, SKILL_DIR } from "../paths.mjs";
import { pathExists } from "../common.mjs";

const CONFIG_CANDIDATES = [
  () => process.env.KELLY_PR_REVIEW_CONFIG,
  () => path.join(SKILL_DIR, "config.local.yml"),
  () => path.join(os.homedir(), ".config", "kelly-pr-review", "config.yml"),
  () => path.join(SKILL_DIR, "config.example.yml"),
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
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
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
  let config = {};
  let exampleOnly = false;
  for (const candidate of CONFIG_CANDIDATES) {
    const pathname = candidate();
    if (!pathname || !(await pathExists(pathname))) continue;
    source = pathname;
    config = YAML.parse(await fs.readFile(pathname, "utf8")) || {};
    exampleOnly = path.resolve(pathname) === path.resolve(path.join(SKILL_DIR, "config.example.yml"));
    if (exampleOnly) config = {};
    break;
  }
  const repos = (config.repos || []).filter((repo) => repo.include !== false && repo.repo);
  const configured = true;
  const defaultMode = exampleOnly || !source || !repos.length;
  const onboarding = !defaultMode
    ? { configured: true, state: "ready", message: "Kelly PR Review is configured." }
    : {
        configured: true,
        state: "gh_defaults",
        message: "Using gh CLI defaults: review requests for the current authenticated account across accessible repositories.",
      };
  return {
    reader: "local",
    configured,
    config,
    source,
    example_only: exampleOnly,
    default_mode: defaultMode,
    onboarding,
  };
}

export function publicConfigSummary(meta) {
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
