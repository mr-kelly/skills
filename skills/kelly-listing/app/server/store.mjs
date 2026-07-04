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

export async function readDecisions() {
  return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
}

export async function readAgentTasks() {
  return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
}

export async function readExecutionReport() {
  return readJson(EXECUTION_REPORT_PATH, null);
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export async function applyDecision(payload = {}) {
  const action = String(payload.action || "");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const snapshot = await readSnapshot();
  let reviewId = String(payload.review_id || "");
  if (!reviewId && payload.draft_id) {
    const item = (snapshot.review_items || []).find((entry) => entry.draft_id === payload.draft_id);
    if (!item) throw new Error(`No review item for draft: ${payload.draft_id}`);
    reviewId = item.review_id;
  }
  if (!reviewId) throw new Error("review_id is required");
  const item = (snapshot.review_items || []).find((entry) => entry.review_id === reviewId);
  if (!item) throw new Error(`Unknown review item: ${reviewId}`);
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[reviewId] = {
    action,
    comment: String(payload.comment || ""),
    fields: payload.fields && typeof payload.fields === "object" ? payload.fields : undefined,
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  const tasks = await readAgentTasks();
  tasks.tasks = (tasks.tasks || []).filter((task) => task.review_id !== reviewId);
  if (action === "request_changes") {
    tasks.tasks.push({
      task_id: `task-${reviewId}-${Date.now()}`,
      type: "revise_listing",
      review_id: reviewId,
      draft_id: item.draft_id,
      ref: item.ref,
      comment: String(payload.comment || ""),
      requested_at: now,
      status: "queued",
    });
  }
  tasks.updated_at = now;
  await writeJson(AGENT_TASKS_PATH, tasks);
  return decisions;
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-listing",
    seller: { brand: "", entity: "" },
    metrics: {
      product_count: 0,
      draft_count: 0,
      drafts_by_platform: {},
      drafts_needs_review: 0,
      drafts_approved: 0,
      drafts_in_revision: 0,
      checks_failed: 0,
      compliance_pass_rate: 0,
      exported_this_week: 0,
    },
    products: [],
    drafts: [],
    rules: [],
    checks: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No listing snapshot exists yet. Ingest product source material, or ask the agent to draft listings from a kelly-picks brief.",
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
  if (process.env.KELLY_LISTING_CONFIG) paths.push(process.env.KELLY_LISTING_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-listing", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_LISTING_ENV_FILE) paths.push(process.env.KELLY_LISTING_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-listing", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const config = configResult.config || {};
  const seller = config.seller || {};
  const exportPrefs = config.export || {};
  const publish = config.publish || {};
  const secretKeys = ["token_env", "api_key_env", "client_secret_env"].filter((key) => publish[key]);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    seller: {
      brand: seller.brand || "",
      entity: seller.entity || "",
      tone: seller.tone || "",
    },
    locales: Array.isArray(config.locales) ? config.locales : [],
    platforms: (Array.isArray(config.platforms) ? config.platforms : []).map((entry) => ({
      platform: entry.platform || "",
      enabled: entry.enabled !== false,
      locales: Array.isArray(entry.locales) ? entry.locales : [],
      rules: entry.rules || {},
    })),
    banned_words_count: Array.isArray(config.banned_words) ? config.banned_words.length : 0,
    competitor_brands_count: Array.isArray(config.competitor_brands) ? config.competitor_brands.length : 0,
    keyword_stuffing: { max_repeats: Number(config.keyword_stuffing?.max_repeats) || 3 },
    export: {
      format: exportPrefs.format || "markdown+csv",
      out_dir: exportPrefs.out_dir || "exports",
    },
    publish: {
      handoff_to_agent: publish.handoff_to_agent ?? true,
      requires_approval: publish.requires_approval ?? true,
      secret_envs: secretKeys.map((key) => publish[key]),
      secrets_ready: secretKeys.every((key) => Boolean(process.env[publish[key]])),
    },
  };
}
