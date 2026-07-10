import path from "node:path";
import type {
  Config,
  ConfigResult,
  ConfigSummary,
  EvalRun,
  Onboarding,
  ReleaseDecision,
} from "../../app/server/types.ts";
import { readJson, readLock, withLock, writeJson } from "../common.ts";
import { computeMetrics } from "../eval-data.ts";
import { DECISIONS_PATH, EVAL_RUN_PATH, ONBOARDING_PATH, RELEASE_DECISION_PATH, SKILL_DIR } from "../paths.ts";
import type { DataProvider, ReleaseInput, ReviewInput } from "./provider-interface.ts";

type DecisionsFile = Record<string, { action: string; note: string; decided_at: string }>;

function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AGENT_EVAL_CONFIG) paths.push(process.env.KELLY_AGENT_EVAL_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-agent-eval", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

async function readEvalRun(): Promise<EvalRun | null> {
  return readJson<EvalRun>(EVAL_RUN_PATH, null);
}

async function readDecisions(): Promise<DecisionsFile> {
  return (await readJson<DecisionsFile>(DECISIONS_PATH, {})) || {};
}

async function readReleaseDecision(): Promise<ReleaseDecision | null> {
  return readJson<ReleaseDecision>(RELEASE_DECISION_PATH, null);
}

function applyDecisions(run: EvalRun, decisions: DecisionsFile): EvalRun {
  const cases = run.cases.map((item) => {
    const decision = decisions[item.id];
    if (!decision) return item;
    return {
      ...item,
      status: "done" as const,
      decision: {
        action: decision.action as "mark_blocking" | "mark_acceptable",
        note: decision.note,
        decided_at: decision.decided_at,
      },
    };
  });
  return { ...run, cases, metrics: computeMetrics(cases) };
}

function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const policy = config.release_policy || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    team_name: config.team_name || "Agent Eval Team",
    baseline_version: config.baseline_version || "baseline",
    candidate_version: config.candidate_version || "candidate",
    release_policy: {
      blocking_regression_blocks_release: policy.blocking_regression_blocks_release !== false,
      min_candidate_pass_rate: typeof policy.min_candidate_pass_rate === "number" ? policy.min_candidate_pass_rate : 80,
    },
  };
}

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async getState(): Promise<Record<string, unknown>> {
    const [run, decisions, release, onboarding, lock, configResult] = await Promise.all([
      readEvalRun(),
      readDecisions(),
      readReleaseDecision(),
      this.getOnboarding(),
      this.getLock(),
      readConfig(),
    ]);
    const mergedRun = run ? applyDecisions(run, decisions) : null;
    return {
      app: "kelly-agent-eval",
      data_provider: this.name,
      onboarding,
      lock,
      config_summary: summarizeConfig(configResult),
      run: mergedRun,
      release_decision: release,
    };
  }

  async submitReview(review: ReviewInput): Promise<Record<string, unknown>> {
    await withLock("kelly-agent-eval", `Recording review for ${review.id}`, async () => {
      const decisions = await readDecisions();
      decisions[review.id] = {
        action: review.action,
        note: review.note || "",
        decided_at: new Date().toISOString(),
      };
      await writeJson(DECISIONS_PATH, decisions);
    });
    return this.getState();
  }

  async submitReleaseDecision(input: ReleaseInput): Promise<Record<string, unknown>> {
    await withLock("kelly-agent-eval", "Recording release decision", async () => {
      const release: ReleaseDecision = {
        decision: input.decision,
        note: input.note || "",
        decided_at: new Date().toISOString(),
      };
      await writeJson(RELEASE_DECISION_PATH, release);
    });
    return this.getState();
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    return summarizeConfig(await readConfig()) as unknown as Record<string, unknown>;
  }

  async getLock(): Promise<Record<string, unknown>> {
    return ((await readLock()) as unknown as Record<string, unknown>) || {};
  }

  async getOnboarding(): Promise<Record<string, unknown>> {
    const onboarding = await readJson<Onboarding>(ONBOARDING_PATH, { completed: false });
    return (onboarding as unknown as Record<string, unknown>) || { completed: false };
  }

  async completeOnboarding(marker: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const value: Onboarding = {
      completed: true,
      completed_at: new Date().toISOString(),
      config_version: "1",
      ...marker,
    };
    await writeJson(ONBOARDING_PATH, value);
    return value as unknown as Record<string, unknown>;
  }
}

export const localFileProvider = new LocalFileProvider();
