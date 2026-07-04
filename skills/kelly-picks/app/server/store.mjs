import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
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

export async function readExecutionReport() {
  return readJson(EXECUTION_REPORT_PATH, null);
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
    source: "kelly-picks",
    base_currency: "USD",
    range: { start: "", end: "" },
    metrics: {
      source_count: 0,
      trend_item_count: 0,
      candidate_count: 0,
      candidates_new_7d: 0,
      candidates_to_review: 0,
      in_development: 0,
      watching: 0,
      dropped: 0,
      proposals_needs_review: 0,
      avg_margin_approved_pct: 0,
      below_margin_floor: 0,
    },
    sources: [],
    trend_items: [],
    candidates: [],
    proposals: [],
    sync_log: [
      {
        at: new Date(0).toISOString(),
        actor: "kelly-picks",
        action: "empty_snapshot",
        detail: "No picks snapshot exists yet. Configure sources, then let the agent sweep and ingest trend payloads.",
      },
    ],
  };
}

export function computeMetrics(snapshot) {
  const candidates = snapshot.candidates || [];
  const proposals = snapshot.proposals || [];
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const approved = candidates.filter((item) => item.stage === "develop");
  const marginOf = (item) => Number(item.margin_card?.margin_pct || 0);
  return {
    source_count: (snapshot.sources || []).length,
    trend_item_count: (snapshot.trend_items || []).length,
    candidate_count: candidates.length,
    candidates_new_7d: candidates.filter((item) => Date.parse(item.first_seen || "") >= weekAgo).length,
    candidates_to_review: candidates.filter((item) => ["new", "reviewing"].includes(item.stage)).length,
    in_development: approved.length,
    watching: candidates.filter((item) => item.stage === "watch").length,
    dropped: candidates.filter((item) => item.stage === "dropped").length,
    proposals_needs_review: proposals.filter((item) => item.status === "needs_review").length,
    avg_margin_approved_pct: approved.length
      ? Math.round((approved.reduce((sum, item) => sum + marginOf(item), 0) / approved.length) * 10) / 10
      : 0,
    below_margin_floor: candidates.filter((item) => item.margin_card?.below_floor).length,
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
  if (process.env.KELLY_PICKS_CONFIG) paths.push(process.env.KELLY_PICKS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-picks", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_PICKS_ENV_FILE) paths.push(process.env.KELLY_PICKS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-picks", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { sources: [], platforms: [] }, path: "", is_example: false };
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
  const profile = config.seller_profile && typeof config.seller_profile === "object" ? config.seller_profile : {};
  const platforms = Array.isArray(config.platforms) ? config.platforms : [];
  const sources = Array.isArray(config.sources) ? config.sources : [];
  const freight = config.freight && typeof config.freight === "object" ? config.freight : {};
  const secretEnvs = [...collectSecretEnvNames(config)];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    seller_profile: {
      store_name: profile.store_name || "",
      categories: Array.isArray(profile.categories) ? profile.categories : [],
      target_platforms: Array.isArray(profile.target_platforms) ? profile.target_platforms : [],
      margin_floor_pct: Number(profile.margin_floor_pct) || 0,
      max_cogs: Number(profile.max_cogs) || 0,
    },
    platforms: platforms.map((platform) => ({
      platform_id: platform.platform_id || "",
      name: platform.name || platform.platform_id || "",
      currency: platform.currency || "USD",
      referral_fee_pct: Number(platform.referral_fee_pct) || 0,
      fulfillment_flat: Number(platform.fulfillment_flat) || 0,
    })),
    freight: {
      default_per_unit: Number(freight.default_per_unit) || 0,
      rules: (Array.isArray(freight.rules) ? freight.rules : []).map((rule) => ({
        category: rule.category || "*",
        per_unit: Number(rule.per_unit) || 0,
      })),
    },
    ad_cost_default_pct: Number(config.ad_cost_default_pct) || 0,
    sources: sources.map((source) => ({
      source_id: source.source_id || "",
      kind: source.kind || "",
      name: source.name || source.source_id || "",
      method: source.method || "manual",
    })),
    env_readiness: secretEnvs.map((name) => ({ name, ready: Boolean(process.env[name]) })),
  };
}
