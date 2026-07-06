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
  item_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

export async function applyDecision(payload: DecisionBody = {}) {
  const itemId = String(payload.item_id || "");
  const action = String(payload.action || "");
  if (!itemId) throw new Error("item_id is required");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[itemId] = {
    action,
    comment: String(payload.comment || ""),
    draft: payload.draft === undefined ? undefined : String(payload.draft),
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  if (action === "request_changes") {
    const tasks = await readAgentTasks();
    tasks.tasks = tasks.tasks.filter((task) => task.item_id !== itemId);
    tasks.tasks.push({
      task_id: `task-${itemId}-${Date.now()}`,
      type: "revise_item",
      item_id: itemId,
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
    source: "kelly-launch",
    product: { name: "", tagline: "", homepage: "", category: "" },
    launch: { target_date: "", timezone: "UTC" },
    phases: ["research", "assemble", "mobilize", "prove"],
    readiness: { verdict: "BLOCK", lqs: 0, ship: 0, fix: 0, block: 0, blockers: [] },
    metrics: {
      item_count: 0,
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      ship: 0,
      fix: 0,
      block: 0,
    },
    channels: [],
    items: [],
    runbook: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No launch plan exists yet. Tell the skill about the product and target date, then let it assemble the RAMP checklist.",
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
  if (process.env.KELLY_LAUNCH_CONFIG) paths.push(process.env.KELLY_LAUNCH_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_LAUNCH_ENV_FILE) paths.push(process.env.KELLY_LAUNCH_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-launch", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { channels: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const config = configResult.config || {};
  const channels = Array.isArray(config.channels) ? config.channels : [];
  const product = config.product || {};
  const launch = config.launch || {};
  const pressLists = Array.isArray(config.press_lists) ? config.press_lists : [];
  const readinessPolicy = config.readiness_policy || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    product: {
      name: product.name || "",
      tagline: product.tagline || "",
      homepage: product.homepage || "",
      category: product.category || "",
    },
    launch: {
      target_date: launch.target_date || "",
      timezone: launch.timezone || "UTC",
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
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key]])),
      };
    }),
  };
}
