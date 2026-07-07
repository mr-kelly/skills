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

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

interface DecisionPayload {
  item_id?: string;
  action?: string;
  comment?: string;
  payload?: Record<string, unknown>;
}

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file: string, fallback: unknown = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export async function getState() {
  const config = await readConfig();
  return {
    app: "kelly-products",
    data_provider: "local-file",
    onboarding: await readJson(ONBOARDING_PATH, { completed: false }),
    lock: await readLock(),
    config_summary: summarizeConfig(config),
    decisions: await readJson(DECISIONS_PATH, { updated_at: "", decisions: {} }),
    agent_tasks: await readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] }),
    execution_report: await readJson(EXECUTION_REPORT_PATH, null),
    snapshot: await readJson(SNAPSHOT_PATH, emptySnapshot()),
  };
}

export async function applyDecision(payload: DecisionPayload = {}) {
  const itemId = String(payload.item_id || "");
  const action = String(payload.action || "");
  if (!itemId) throw new Error("item_id is required");
  if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
  const now = new Date().toISOString();
  const decisions = (await readJson(DECISIONS_PATH, { updated_at: "", decisions: {} })) as {
    updated_at: string;
    decisions: Record<string, unknown>;
  };
  decisions.decisions[itemId] = {
    action,
    comment: String(payload.comment || ""),
    payload: payload.payload || {},
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);

  if (action === "request_changes" || action === "revise") {
    const tasks = (await readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as {
      updated_at: string;
      tasks: Array<Record<string, unknown>>;
    };
    tasks.tasks = tasks.tasks.filter((task) => task.item_id !== itemId);
    tasks.tasks.push({
      task_id: `task-${itemId}-${Date.now()}`,
      type: action === "revise" ? "revise_product_record" : "revise_product_recommendation",
      item_id: itemId,
      comment: String(payload.comment || ""),
      payload: payload.payload || {},
      requested_at: now,
      status: "queued",
    });
    tasks.updated_at = now;
    await writeJson(AGENT_TASKS_PATH, tasks);
  }
  return decisions;
}

function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-products",
    seller: { brand: "", entity: "" },
    metrics: {
      product_count: 0,
      active_count: 0,
      needs_review_count: 0,
      low_stock_count: 0,
      channel_issue_count: 0,
      avg_margin_pct: 0,
      inventory_value: 0,
    },
    products: [],
    channel_matrix: [],
    inventory: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No product snapshot exists yet. Import products or ask the agent to prepare a product-management snapshot.",
      },
    ],
  };
}

export function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_PRODUCTS_CONFIG) paths.push(process.env.KELLY_PRODUCTS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-products", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_PRODUCTS_ENV_FILE) paths.push(process.env.KELLY_PRODUCTS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-products", ".env"));
  return paths;
}

async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config)
      return {
        config: config as Record<string, unknown>,
        path: file,
        is_example: file.endsWith("config.example.json"),
      };
  }
  return { config: {}, path: "", is_example: false };
}

function summarizeConfig(configResult: { config: Record<string, unknown>; path: string; is_example: boolean }) {
  const config = configResult.config || {};
  const seller = (config.seller || {}) as Record<string, unknown>;
  const platforms = Array.isArray(config.platforms) ? (config.platforms as Array<Record<string, unknown>>) : [];
  const warehouses = Array.isArray(config.warehouses) ? (config.warehouses as Array<Record<string, unknown>>) : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    seller: {
      brand: String(seller.brand || ""),
      entity: String(seller.entity || ""),
      base_currency: String(seller.base_currency || "USD"),
    },
    platforms: platforms.map((platform) => {
      const secretKeys = ["token_env", "api_key_env", "secret_env"].filter((key) => platform[key]);
      return {
        platform: String(platform.platform || ""),
        enabled: platform.enabled !== false,
        store_name: String(platform.store_name || ""),
        secret_envs: secretKeys.map((key) => String(platform[key])),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[String(platform[key])])),
      };
    }),
    warehouses: warehouses.map((warehouse) => ({
      warehouse_id: String(warehouse.warehouse_id || ""),
      name: String(warehouse.name || ""),
      region: String(warehouse.region || ""),
    })),
    review_policy: config.review_policy || {},
    sync: config.sync || {},
  };
}

export async function loadDotenvFiles(files: string[]) {
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
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
