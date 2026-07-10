import fs from "node:fs/promises";
import type {
  Batch,
  Candidate,
  Config,
  ConfigResult,
  ConfigSummary,
  Onboarding,
  Rubric,
} from "../../app/server/types.ts";
import { configSearchPaths, readJson, withLock, writeJson } from "../common.ts";
import {
  AGENT_TASKS_PATH,
  BATCH_PATH,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
} from "../paths.ts";
import { DEFAULT_RUBRIC, computeScore } from "../scoring.ts";
import type { DataProvider, ReviewInput } from "./provider-interface.ts";

export function emptyBatch(): Batch {
  return {
    batch_id: "",
    generated_at: new Date(0).toISOString(),
    source: "kelly-deal-scorer",
    mode: "app-in-skill",
    metrics: { needs_review: 0, approved: 0, done: 0, blocked: 0 },
    distribution: { high_confidence: 0, needs_review: 0, low_confidence: 0, average_score: 0 },
    items: [],
  };
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function rubricFromConfig(configResult: ConfigResult): Rubric {
  const rubric = configResult.config?.rubric;
  if (!rubric) return DEFAULT_RUBRIC;
  return {
    weights: { ...DEFAULT_RUBRIC.weights, ...rubric.weights },
    category_risk_tier: { ...DEFAULT_RUBRIC.category_risk_tier, ...rubric.category_risk_tier },
    decision_thresholds: { ...DEFAULT_RUBRIC.decision_thresholds, ...rubric.decision_thresholds },
    revenue_share_rate: { ...DEFAULT_RUBRIC.revenue_share_rate, ...rubric.revenue_share_rate },
  };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const rubric = rubricFromConfig(configResult);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    rubric: {
      weights: rubric.weights,
      decision_thresholds: rubric.decision_thresholds,
    },
  };
}

// Recompute metrics/distribution from items so the file is always internally
// consistent, even if it was hand-edited.
export function deriveBatchAggregates(batch: Batch): Batch {
  const metrics = { needs_review: 0, approved: 0, done: 0, blocked: 0 };
  let high = 0;
  let review = 0;
  let low = 0;
  let sum = 0;
  for (const item of batch.items) {
    if (item.status === "needs_review" || item.status === "changes_requested") metrics.needs_review += 1;
    else if (item.status === "approved") metrics.approved += 1;
    else if (item.status === "done") metrics.done += 1;
    else if (item.status === "blocked") metrics.blocked += 1;
    const score = item.score?.composite_score ?? 0;
    sum += score;
    if (score >= DEFAULT_RUBRIC.decision_thresholds.high_confidence_min) high += 1;
    else if (score >= DEFAULT_RUBRIC.decision_thresholds.needs_review_min) review += 1;
    else low += 1;
  }
  batch.metrics = metrics;
  batch.distribution = {
    high_confidence: high,
    needs_review: review,
    low_confidence: low,
    average_score: batch.items.length ? Math.round((sum / batch.items.length) * 10) / 10 : 0,
  };
  return batch;
}

export async function readBatch(): Promise<Batch> {
  const batch = await readJson<Batch>(BATCH_PATH, emptyBatch());
  return deriveBatchAggregates((batch as Batch) || emptyBatch());
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<unknown> {
  return readJson(LOCK_PATH, null);
}

export async function readAgentTasks(batch: Batch): Promise<Candidate[]> {
  return batch.items.filter((item) => item.status === "changes_requested");
}

const VALID_ACTIONS = new Set(["approve_term_sheet", "send_back_for_data", "reject"]);

function statusForAction(action: ReviewInput["action"]): Candidate["status"] {
  if (action === "approve_term_sheet") return "approved";
  if (action === "send_back_for_data") return "changes_requested";
  return "blocked";
}

class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async getState(): Promise<Record<string, unknown>> {
    const [batch, onboarding, lock, configResult] = await Promise.all([
      readBatch(),
      readOnboarding(),
      readLock(),
      readConfig(),
    ]);
    return {
      app: "kelly-deal-scorer",
      data_provider: process.env.KELLY_DEAL_SCORER_DATA_PROVIDER || configResult.config.data_provider || "local",
      onboarding,
      lock,
      config_summary: summarizeConfig(configResult),
      batch,
    };
  }

  async submitReview(review: ReviewInput): Promise<Record<string, unknown>> {
    if (!review?.id) throw new Error("submitReview requires an id");
    if (!VALID_ACTIONS.has(review.action)) throw new Error(`Unknown decision action: ${review.action}`);
    return withLock("kelly-deal-scorer", `Recording decision for ${review.id}`, async () => {
      const batch = await readBatch();
      const item = batch.items.find((candidate) => candidate.id === review.id);
      if (!item) throw new Error(`Candidate not found: ${review.id}`);
      item.decision = {
        action: review.action,
        comment: review.comment || "",
        decided_at: new Date().toISOString(),
      };
      item.status = statusForAction(review.action);
      deriveBatchAggregates(batch);
      await writeJson(BATCH_PATH, batch);

      const decisions = (await readJson<Record<string, unknown>>(DECISIONS_PATH, {})) || {};
      decisions[review.id] = item.decision;
      await writeJson(DECISIONS_PATH, decisions);

      return { item, batch };
    });
  }

  async getAgentTasks(): Promise<Record<string, unknown>> {
    const batch = await readBatch();
    return { tasks: await readAgentTasks(batch) };
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    const configResult = await readConfig();
    return summarizeConfig(configResult) as unknown as Record<string, unknown>;
  }

  async getLock(): Promise<Record<string, unknown>> {
    return ((await readLock()) as Record<string, unknown>) || {};
  }

  async getOnboarding(): Promise<Record<string, unknown>> {
    return (await readOnboarding()) as unknown as Record<string, unknown>;
  }

  async completeOnboarding(marker: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const onboarding: Onboarding = {
      completed: true,
      completed_at: new Date().toISOString(),
      config_version: "1",
      ...marker,
    };
    await writeJson(ONBOARDING_PATH, onboarding);
    return onboarding as unknown as Record<string, unknown>;
  }

  async verifyConnection(): Promise<Record<string, unknown>> {
    try {
      await fs.access(BATCH_PATH);
      return { ok: true, message: "Local batch file readable." };
    } catch {
      return { ok: false, message: "No local batch file yet — run scripts/generate_batch.ts." };
    }
  }
}

export const localFileProvider = new LocalFileProvider();

// Re-exported for scripts/execute_decisions.ts.
export { EXECUTION_REPORT_PATH, AGENT_TASKS_PATH };
export { computeScore };
