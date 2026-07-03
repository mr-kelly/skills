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
  SNAPSHOT_PATH
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
  if (!reviewId && payload.plan_id) {
    const item = (snapshot.review_items || []).find((entry) => entry.plan_id === payload.plan_id);
    if (!item) throw new Error(`No review item for plan: ${payload.plan_id}`);
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
    draft: payload.draft === undefined ? undefined : String(payload.draft),
    decided_at: now
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  const tasks = await readAgentTasks();
  tasks.tasks = (tasks.tasks || []).filter((task) => task.review_id !== reviewId);
  if (action === "request_changes") {
    tasks.tasks.push({
      task_id: `task-${reviewId}-${Date.now()}`,
      type: "revise_plan",
      review_id: reviewId,
      plan_id: item.plan_id,
      ref: item.ref,
      comment: String(payload.comment || ""),
      draft: payload.draft === undefined ? undefined : String(payload.draft),
      requested_at: now,
      status: "queued"
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
    source: "kelly-lesson",
    school: { name: "", kind: "", class_length_minutes: 45, term: "" },
    metrics: {
      teacher_count: 0,
      plan_count: 0,
      plans_approved: 0,
      plans_in_revision: 0,
      plans_needs_review: 0,
      checks_failed: 0,
      compliance_pass_rate: 0
    },
    teachers: [],
    plans: [],
    rules: [],
    checks: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No lesson snapshot exists yet. Ingest a lesson plan or ask the agent to draft one from your curriculum materials."
      }
    ]
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
  if (process.env.KELLY_LESSON_CONFIG) paths.push(process.env.KELLY_LESSON_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-lesson", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_LESSON_ENV_FILE) paths.push(process.env.KELLY_LESSON_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-lesson", ".env"));
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
  const school = config.school || {};
  const feedback = config.feedback || {};
  const exportPrefs = config.export || {};
  const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => feedback[key]);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    school: {
      name: school.name || "",
      kind: school.kind || "",
      term: school.term || "",
      class_length_minutes: school.class_length_minutes ?? 45
    },
    subjects: Array.isArray(config.subjects) ? config.subjects : [],
    grades: Array.isArray(config.grades) ? config.grades : [],
    template_sections: (Array.isArray(config.template_sections) ? config.template_sections : []).map((section) => ({
      key: section.key || "",
      label: section.label || section.key || "",
      required: Boolean(section.required)
    })),
    compliance_rules: (Array.isArray(config.compliance_rules) ? config.compliance_rules : []).map((rule) => ({
      rule_id: rule.rule_id || "",
      name: rule.name || rule.rule_id || "",
      severity: rule.severity || "warning",
      type: rule.type || "deterministic"
    })),
    export: {
      format: exportPrefs.format || "markdown",
      out_dir: exportPrefs.out_dir || "exports",
      docx_via_agent: exportPrefs.docx_via_agent ?? true
    },
    feedback: {
      handoff_skill: feedback.handoff_skill || "",
      requires_approval: feedback.requires_approval ?? true,
      secret_envs: secretKeys.map((key) => feedback[key]),
      secrets_ready: secretKeys.every((key) => Boolean(process.env[feedback[key]]))
    }
  };
}
