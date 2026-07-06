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
  send_id?: string;
  action?: string;
  comment?: string;
  body?: string;
  chosen_variant?: string;
}

export async function applyDecision(payload: DecisionBody = {}) {
  const sendId = String(payload.send_id || "");
  const action = String(payload.action || "");
  if (!sendId) throw new Error("send_id is required");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[sendId] = {
    action,
    comment: String(payload.comment || ""),
    body: payload.body === undefined ? undefined : String(payload.body),
    chosen_variant: payload.chosen_variant === undefined ? undefined : String(payload.chosen_variant),
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  if (action === "request_changes") {
    const tasks = await readAgentTasks();
    tasks.tasks = tasks.tasks.filter((task) => task.send_id !== sendId);
    tasks.tasks.push({
      task_id: `task-${sendId}-${Date.now()}`,
      type: "revise_send",
      send_id: sendId,
      comment: String(payload.comment || ""),
      body: payload.body === undefined ? undefined : String(payload.body),
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
    source: "kelly-campaigns",
    list_health: {
      subscriber_count: 0,
      bounce_rate: 0,
      complaint_rate: 0,
      churn_rate: 0,
      avg_open_rate: 0,
      avg_click_rate: 0,
    },
    metrics: {
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      scheduled: 0,
      at_risk: 0,
    },
    segments: [],
    sends: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No campaign snapshot exists yet. Give the skill a brief or audience, then let it draft sends for review.",
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
  if (process.env.KELLY_CAMPAIGNS_CONFIG) paths.push(process.env.KELLY_CAMPAIGNS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-campaigns", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_CAMPAIGNS_ENV_FILE) paths.push(process.env.KELLY_CAMPAIGNS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-campaigns", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { from_identities: [], segments: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const config = configResult.config || {};
  const operator = config.operator || {};
  const brand = config.brand || {};
  const esp = config.esp || {};
  const policy = config.sending_policy || {};
  const identities = Array.isArray(config.from_identities) ? config.from_identities : [];
  const segments = Array.isArray(config.segments) ? config.segments : [];
  const espSecretKeys = ["api_key_env", "token_env", "password_env"].filter((key) => esp[key]);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
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
      secrets_ready: espSecretKeys.length > 0 && espSecretKeys.every((key) => Boolean(process.env[esp[key]])),
    },
    from_identities: identities.map((identity) => ({
      identity_id: identity.identity_id || "",
      from_name: identity.from_name || "",
      from_email: identity.from_email || "",
      reply_to: identity.reply_to || "",
      use_when: Array.isArray(identity.use_when) ? identity.use_when : [],
    })),
    segments: segments.map((segment) => ({
      segment_id: segment.segment_id || "",
      name: segment.name || segment.segment_id || "",
      description: segment.description || "",
    })),
    sending_policy: {
      approval_required: policy.approval_required !== false,
      daily_send_cap: Number(policy.daily_send_cap || 0),
      hourly_send_cap: Number(policy.hourly_send_cap || 0),
      min_inbox_readiness: Number(policy.min_inbox_readiness || 0),
      max_spam_score: Number(policy.max_spam_score || 0),
    },
    style_tone: config.style?.tone || "",
  };
}
