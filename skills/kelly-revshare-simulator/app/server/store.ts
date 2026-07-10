import crypto from "node:crypto";
import { getProvider } from "../../lib/data-provider/index.ts";
import { simulateScenario } from "../../lib/simulate.ts";
import type { ScenarioInput } from "../../lib/simulate.ts";
import type { Config, ConfigSummary, Scenario, ScenarioBatch, ScenarioDecision, UnderwritingPolicy } from "./types.ts";

const DEFAULT_POLICY: UnderwritingPolicy = {
  max_effective_annual_cost_pct: 40,
  min_cap_multiple: 1.2,
  max_cap_multiple: 2.5,
  max_term_months: 36,
};

export function newScenarioId(): string {
  return `scn_${crypto.randomBytes(6).toString("hex")}`;
}

export function emptyDecision(): ScenarioDecision {
  return { action: null, note: "", decided_at: null };
}

export function buildScenario(name: string, input: ScenarioInput, id?: string): Scenario {
  const now = new Date().toISOString();
  return {
    id: id || newScenarioId(),
    name,
    created_at: now,
    updated_at: now,
    input,
    result: simulateScenario(input),
    decision: emptyDecision(),
  };
}

export function recomputeMetrics(batch: ScenarioBatch): ScenarioBatch {
  const metrics = { total: 0, approved: 0, needs_revision: 0, rejected: 0, undecided: 0 };
  for (const scenario of batch.scenarios) {
    metrics.total += 1;
    if (scenario.decision.action === "approve_underwriting") metrics.approved += 1;
    else if (scenario.decision.action === "needs_revision") metrics.needs_revision += 1;
    else if (scenario.decision.action === "reject") metrics.rejected += 1;
    else metrics.undecided += 1;
  }
  batch.metrics = metrics;
  return batch;
}

export async function readBatch(): Promise<ScenarioBatch> {
  return getProvider().readBatch();
}

export async function writeBatch(batch: ScenarioBatch): Promise<void> {
  recomputeMetrics(batch);
  await getProvider().writeBatch(batch);
}

export async function readOnboarding() {
  return getProvider().readOnboarding();
}

export async function readLock() {
  return getProvider().readLock();
}

export async function readConfig() {
  return getProvider().readConfig();
}

export function summarizeConfig(configResult: { config: Config; path: string; is_example: boolean }): ConfigSummary {
  const config = configResult.config || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    data_provider: config.data_provider || "local",
    underwriting_policy: { ...DEFAULT_POLICY, ...(config.underwriting_policy || {}) },
  };
}
