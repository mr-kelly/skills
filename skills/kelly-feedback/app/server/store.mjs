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
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
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
  return readJson(DECISIONS_PATH, emptyDecisions());
}

export function emptyDecisions() {
  return {
    schema_version: "1",
    updated_at: new Date(0).toISOString(),
    proposals: {},
    feedback: {},
    requests: {},
  };
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-feedback",
    products: [],
    sources: [],
    feedback: [],
    requests: [],
    roadmap: { now: [], next: [], later: [] },
    proposals: [],
    metrics: {
      feedback_count: 0,
      new_feedback: 0,
      request_count: 0,
      proposals_needs_review: 0,
      requests_needs_info: 0,
    },
    sync_log: [
      {
        at: new Date(0).toISOString(),
        actor: "kelly-feedback",
        action: "init",
        detail: "No feedback snapshot exists yet. Configure sources, then ingest feedback payloads.",
        count: 0,
      },
    ],
  };
}

export async function recordDecision(body) {
  const decisions = await readDecisions();
  const now = new Date().toISOString();
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  if (!id) throw new Error("id is required");
  if (kind === "proposal") {
    const action = String(body.action || "");
    if (!["approve", "request_changes", "block", "revise"].includes(action)) {
      throw new Error(`unsupported proposal action: ${action}`);
    }
    decisions.proposals[id] = {
      action,
      review_note: String(body.review_note || ""),
      draft: typeof body.draft === "string" ? body.draft : undefined,
      decided_at: now,
    };
    if (action === "request_changes") {
      await enqueueAgentTask({
        type: "revise_proposal",
        proposal_id: id,
        note: String(body.review_note || ""),
      });
    }
  } else if (kind === "feedback") {
    const action = String(body.action || "");
    if (!["assign", "ignore", "insight"].includes(action)) {
      throw new Error(`unsupported feedback action: ${action}`);
    }
    decisions.feedback[id] = {
      action,
      request_id: String(body.request_id || ""),
      comment: String(body.comment || ""),
      decided_at: now,
    };
  } else if (kind === "request") {
    decisions.requests[id] = {
      effort_estimate: String(body.effort_estimate || ""),
      comment: String(body.comment || ""),
      decided_at: now,
    };
  } else {
    throw new Error(`unsupported decision kind: ${kind}`);
  }
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);
  return decisions;
}

async function enqueueAgentTask(task) {
  const tasks = await readJson(AGENT_TASKS_PATH, { schema_version: "1", updated_at: "", tasks: [] });
  const now = new Date().toISOString();
  tasks.tasks.push({
    task_id: `task-${Date.now()}-${tasks.tasks.length + 1}`,
    status: "queued",
    created_at: now,
    ...task,
  });
  tasks.updated_at = now;
  await writeJson(AGENT_TASKS_PATH, tasks);
}

export async function acquireLock(message) {
  const existing = await readLock();
  if (existing) {
    throw new Error(
      `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "no message"}); refusing to write`,
    );
  }
  const lock = { owner: "kelly-feedback", message, started_at: new Date().toISOString() };
  await writeJson(LOCK_PATH, lock);
  return lock;
}

export async function releaseLock() {
  await fs.rm(LOCK_PATH, { force: true });
}

// Derive request frequency/weighted score and snapshot metrics from the raw
// feedback stream so the numbers always agree after any merge.
export function recomputeDerived(snapshot) {
  const byRequest = new Map((snapshot.requests || []).map((item) => [item.request_id, item]));
  for (const request of snapshot.requests || []) {
    request.frequency = 0;
    request.weighted_score = 0;
  }
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const ref = new Date(snapshot.generated_at || Date.now()).getTime();
  const week_inflow = {};
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const item of snapshot.feedback || []) {
    const request = byRequest.get(item.request_id);
    if (request) {
      request.frequency += 1;
      request.weighted_score += Number(item.user?.weight || 1);
    }
    sentiment[item.sentiment] = (sentiment[item.sentiment] || 0) + 1;
    if (ref - new Date(item.received_at).getTime() <= weekMs) {
      week_inflow[item.channel] = (week_inflow[item.channel] || 0) + 1;
    }
  }
  snapshot.metrics = {
    feedback_count: (snapshot.feedback || []).length,
    new_feedback: (snapshot.feedback || []).filter((item) => item.triage === "new").length,
    request_count: (snapshot.requests || []).length,
    proposals_needs_review: (snapshot.proposals || []).filter((item) => item.status === "needs_review").length,
    requests_needs_info: (snapshot.requests || []).filter((item) => item.status === "needs_info").length,
    week_inflow,
    sentiment,
  };
  return snapshot;
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
  if (process.env.KELLY_FEEDBACK_CONFIG) paths.push(process.env.KELLY_FEEDBACK_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-feedback", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_FEEDBACK_ENV_FILE) paths.push(process.env.KELLY_FEEDBACK_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-feedback", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { products: [], sources: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const products = Array.isArray(configResult.config.products) ? configResult.config.products : [];
  const sources = Array.isArray(configResult.config.sources) ? configResult.config.sources : [];
  const scoring =
    configResult.config.scoring && typeof configResult.config.scoring === "object" ? configResult.config.scoring : {};
  const roadmap =
    configResult.config.roadmap && typeof configResult.config.roadmap === "object" ? configResult.config.roadmap : {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    products: products.map((product) => ({
      product_id: product.product_id || "",
      display_name: product.display_name || product.product_id || "",
      tagline: product.tagline || "",
    })),
    sources: sources.map((source) => {
      const secretKeys = ["api_key_env", "token_env", "webhook_env"].filter((key) => source[key]);
      return {
        source_id: source.source_id || "",
        channel: source.channel || "",
        name: source.name || source.source_id || "",
        collection: source.collection || "",
        secret_envs: secretKeys.map((key) => source[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[source[key]])),
      };
    }),
    scoring: {
      plan_weights: scoring.plan_weights || {},
      default_weight: scoring.default_weight ?? 1,
      recency_half_life_days: scoring.recency_half_life_days ?? 30,
    },
    roadmap_lanes: Array.isArray(roadmap.lanes) ? roadmap.lanes : ["now", "next", "later"],
  };
}
