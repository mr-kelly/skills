// Shared, provider-independent helpers for kelly-feedback: JSON file I/O,
// empty-state factories, the derived-metrics recompute, and config/dotenv
// loading. These are pure data transforms and filesystem primitives reused by
// the local provider and the scripts; they carry no backend opinion.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { Config, ConfigResult, Decisions, FeedbackSnapshot } from "./types.ts";

export async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

export function emptyDecisions(): Decisions {
  return {
    schema_version: "1",
    updated_at: new Date(0).toISOString(),
    proposals: {},
    feedback: {},
    requests: {},
  };
}

export function emptySnapshot(): FeedbackSnapshot {
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

// Derive request frequency/weighted score and snapshot metrics from the raw
// feedback stream so the numbers always agree after any merge.
export function recomputeDerived(snapshot: FeedbackSnapshot): FeedbackSnapshot {
  const byRequest = new Map((snapshot.requests || []).map((item) => [item.request_id, item]));
  for (const request of snapshot.requests || []) {
    request.frequency = 0;
    request.weighted_score = 0;
  }
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const ref = new Date(snapshot.generated_at || Date.now()).getTime();
  const week_inflow: Record<string, number> = {};
  const sentiment: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
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

export async function loadDotenvFiles(files: string[]): Promise<void> {
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

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_FEEDBACK_CONFIG) paths.push(process.env.KELLY_FEEDBACK_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-feedback", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_FEEDBACK_ENV_FILE) paths.push(process.env.KELLY_FEEDBACK_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-feedback", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { products: [], sources: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const products = Array.isArray(configResult.config.products) ? configResult.config.products : [];
  const sources = Array.isArray(configResult.config.sources) ? configResult.config.sources : [];
  const scoring: Record<string, any> =
    configResult.config.scoring && typeof configResult.config.scoring === "object" ? configResult.config.scoring : {};
  const roadmap: Record<string, any> =
    configResult.config.roadmap && typeof configResult.config.roadmap === "object" ? configResult.config.roadmap : {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    products: products.map((product: any) => ({
      product_id: product.product_id || "",
      display_name: product.display_name || product.product_id || "",
      tagline: product.tagline || "",
    })),
    sources: sources.map((source: any) => {
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
