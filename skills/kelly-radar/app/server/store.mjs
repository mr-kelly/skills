import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "./paths.mjs";

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

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readSnapshot() {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export async function readDecisions() {
  return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
}

export async function readAgentTasks() {
  return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
}

export async function acquireLock(owner, message) {
  const existing = await readLock();
  if (existing) {
    throw new Error(
      `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "working"}). Retry after it is released.`,
    );
  }
  await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
}

export async function releaseLock() {
  await fs.rm(LOCK_PATH, { force: true });
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-radar",
    range: { start: "", end: "" },
    metrics: {
      watch_target_count: 0,
      signal_count: 0,
      signals_needs_review: 0,
      questions_open: 0,
      briefs_needs_review: 0,
      reports_ready: 0,
      trend_mover_count: 0,
      opportunities_open: 0,
    },
    watchlist: [],
    signals: [],
    research: { questions: [], briefs: [], reports: [] },
    trends: { movers: [], opportunities: [] },
    sync_log: [
      {
        at: new Date(0).toISOString(),
        actor: "kelly-radar",
        action: "empty_snapshot",
        detail: "No radar snapshot exists yet. Configure the watchlist, then let the agent collect signals.",
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
  if (process.env.KELLY_RADAR_CONFIG) paths.push(process.env.KELLY_RADAR_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-radar", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_RADAR_ENV_FILE) paths.push(process.env.KELLY_RADAR_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-radar", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { watchlist: [] }, path: "", is_example: false };
}

function collectSecretEnvNames(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectSecretEnvNames(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key.endsWith("_env") && typeof inner === "string" && inner) found.add(inner);
      else collectSecretEnvNames(inner, found);
    }
  }
  return found;
}

export function summarizeConfig(configResult) {
  const config = configResult.config || {};
  const watchlist = Array.isArray(config.watchlist) ? config.watchlist : [];
  const trendSources = Array.isArray(config.trend_sources) ? config.trend_sources : [];
  const research = config.research && typeof config.research === "object" ? config.research : {};
  const profile = config.profile && typeof config.profile === "object" ? config.profile : {};
  const secretEnvs = [...collectSecretEnvNames(config)];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    profile: {
      products: (Array.isArray(profile.products) ? profile.products : []).map((product) => ({
        name: product.name || "",
        positioning: product.positioning || "",
      })),
    },
    watchlist: watchlist.map((target) => ({
      target_id: target.target_id || "",
      name: target.name || target.target_id || "",
      type: target.type || "",
      source_count: Array.isArray(target.sources) ? target.sources.length : 0,
      methods: [
        ...new Set((Array.isArray(target.sources) ? target.sources : []).map((source) => source.method || "manual")),
      ],
    })),
    research_defaults: {
      default_depth: research.default_depth || "standard",
      source_policy: research.source_policy || "public_pages_only",
      require_citations: research.require_citations !== false,
      max_sources: research.max_sources || 8,
    },
    trend_sources: trendSources.map((source) => ({
      source_id: source.source_id || "",
      kind: source.kind || "",
      name: source.name || source.source_id || "",
      method: source.method || "manual",
    })),
    cadence: config.cadence && typeof config.cadence === "object" ? config.cadence : {},
    env_readiness: secretEnvs.map((name) => ({ name, ready: Boolean(process.env[name]) })),
  };
}
