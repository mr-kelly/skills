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
  followup_id?: string;
  action?: string;
  comment?: string;
  draft?: string;
}

export async function applyDecision(payload: DecisionBody = {}) {
  const followupId = String(payload.followup_id || "");
  const action = String(payload.action || "");
  if (!followupId) throw new Error("followup_id is required");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[followupId] = {
    action,
    comment: String(payload.comment || ""),
    draft: payload.draft === undefined ? undefined : String(payload.draft),
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  if (action === "request_changes") {
    const tasks = await readAgentTasks();
    tasks.tasks = tasks.tasks.filter((task) => task.followup_id !== followupId);
    tasks.tasks.push({
      task_id: `task-${followupId}-${Date.now()}`,
      type: "revise_followup",
      followup_id: followupId,
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
    source: "kelly-crm",
    base_currency: "USD",
    pipeline_stages: ["lead", "qualified", "proposal", "negotiation", "won", "lost"],
    metrics: {
      contact_count: 0,
      company_count: 0,
      deal_count: 0,
      open_deal_count: 0,
      pipeline_value: 0,
      weighted_pipeline_value: 0,
      followups_needs_review: 0,
      followups_due: 0,
    },
    companies: [],
    contacts: [],
    deals: [],
    interactions: [],
    followups: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No CRM snapshot exists yet. Feed the skill emails or meeting notes, then let it generate one.",
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
  if (process.env.KELLY_CRM_CONFIG) paths.push(process.env.KELLY_CRM_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-crm", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_CRM_ENV_FILE) paths.push(process.env.KELLY_CRM_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-crm", ".env"));
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
  const operator = config.operator || {};
  const pipeline = config.pipeline || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    pipeline_stages: Array.isArray(pipeline.stages) ? pipeline.stages : [],
    base_currency: pipeline.base_currency || "USD",
    style_tone: config.style?.tone || "",
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
