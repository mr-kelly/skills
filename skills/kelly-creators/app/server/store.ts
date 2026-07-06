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
} from "./paths.ts";

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

interface DecisionBody {
  creator_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

export async function applyDecision(payload: DecisionBody = {}) {
  const creatorId = String(payload.creator_id || "");
  const action = String(payload.action || "");
  if (!creatorId) throw new Error("creator_id is required");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[creatorId] = {
    action,
    comment: String(payload.comment || ""),
    draft: payload.draft === undefined ? undefined : String(payload.draft),
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  if (action === "request_changes") {
    const tasks = await readAgentTasks();
    tasks.tasks = tasks.tasks.filter((task) => task.creator_id !== creatorId);
    tasks.tasks.push({
      task_id: `task-${creatorId}-${Date.now()}`,
      type: "revise_outreach",
      creator_id: creatorId,
      comment: String(payload.comment || ""),
      draft: payload.draft === undefined ? undefined : String(payload.draft),
      requested_at: now,
      status: "queued",
    });
    tasks.updated_at = now;
    await writeJson(AGENT_TASKS_PATH, tasks);
  }
  return decisions;
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-creators",
    base_currency: "USD",
    pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
    metrics: {
      creator_count: 0,
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      total_reach: 0,
      budget_total: 0,
      budget_allocated: 0,
      est_value: 0,
    },
    creators: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No creator snapshot exists yet. Feed the skill a niche, brand brief, or candidate list, then let it sweep and score creators.",
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

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { platforms: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
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
      return {
        platform_id: platform.platform_id || "",
        type: platform.type || "",
        display_name: platform.display_name || platform.platform_id || "",
        handoff_skill: platform.handoff_skill || "",
        secret_envs: secretKeys.map((key) => platform[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[platform[key]])),
      };
    }),
  };
}
