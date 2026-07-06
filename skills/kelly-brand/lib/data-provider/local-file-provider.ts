// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This provider is the offline
// reference implementation of the same brand-narrative review model Busabase
// serves remotely, so KELLY_BRAND_DATA_PROVIDER=local|busabase is a config
// switch, not a rewrite of the UI or scripts.
//
// The fs logic here was formerly app/server/store.ts; moving it behind the
// DataProvider interface keeps `/api/state` byte-identical while making the
// backend swappable.

import fs from "node:fs/promises";
import path from "node:path";
import {
  agentTasksPath,
  dataDir,
  decisionsPath,
  executionReportPath,
  lockPath,
  onboardingPath,
  skillDir,
  snapshotPath,
} from "../paths.ts";
import type {
  AgentTasksFile,
  BrandState,
  Config,
  DecisionInput,
  DecisionsFile,
  HttpError,
  OnboardingMarker,
  ProviderMeta,
  Snapshot,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

// Verdict verbs are provider-neutral. Here `approve` promotes a narrative asset
// to the canonical brand narrative; `resolve_drift`/`dismiss_drift` act on a
// drift alert instead of a narrative item.
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise", "resolve_drift", "dismiss_drift"]);

async function readJson<T = unknown>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function emptySnapshot(): Snapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-brand",
    brand_name: "",
    framework: "TALE",
    positioning: {
      statement: "",
      status: "needs_review",
    },
    metrics: {
      item_count: 0,
      canonical_count: 0,
      needs_review_count: 0,
      pillar_count: 0,
      story_count: 0,
      proof_point_count: 0,
      overall_nqs: 0,
      drift_open_count: 0,
    },
    items: [],
    drift_alerts: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No brand narrative snapshot exists yet. Feed the skill your positioning inputs and messaging, then let it draft one.",
      },
    ],
  };
}

function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_BRAND_CONFIG) paths.push(process.env.KELLY_BRAND_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-brand", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config | null>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { channels: [] }, path: "", is_example: false };
}

function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const config = configResult.config || {};
  const channels = Array.isArray(config.channels) ? (config.channels as Record<string, unknown>[]) : [];
  const brand = (config.brand as Record<string, unknown>) || {};
  const style = (config.style as Record<string, unknown>) || {};
  const officialUrls = (config.official_urls as Record<string, unknown>) || {};
  const riskPolicy = (config.risk_policy as Record<string, unknown>) || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    brand: {
      name: brand.name || "",
      category: brand.category || "",
      audience: brand.audience || "",
      mission: brand.mission || "",
      framework: brand.framework || "TALE",
    },
    style_tone: style.tone || "",
    reading_level: style.reading_level || "",
    official_urls: Object.entries(officialUrls).map(([key, value]) => ({ key, url: String(value) })),
    banned_phrases: Array.isArray(riskPolicy.banned_phrases) ? riskPolicy.banned_phrases : [],
    regulated_claims: Array.isArray(riskPolicy.regulated_claims) ? riskPolicy.regulated_claims : [],
    channels: channels.map((channel) => {
      const secretKeys = ["source_url_env", "token_env", "api_key_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        monitored: Boolean(channel.monitored),
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[String(channel[key])])),
      };
    }),
  };
}

export class LocalFileProvider implements DataProvider {
  readonly name = "local";
  #meta: ProviderMeta;

  constructor(meta: ProviderMeta = {}) {
    this.#meta = meta;
  }

  async getSnapshot(): Promise<Snapshot> {
    return readJson<Snapshot>(snapshotPath, emptySnapshot());
  }

  async getDecisions(): Promise<DecisionsFile> {
    return readJson<DecisionsFile>(decisionsPath, { updated_at: "", decisions: {} });
  }

  async getAgentTasks(): Promise<AgentTasksFile> {
    return readJson<AgentTasksFile>(agentTasksPath, { updated_at: "", tasks: [] });
  }

  async getExecutionReport(): Promise<unknown> {
    return readJson<unknown>(executionReportPath, null);
  }

  async getOnboarding(): Promise<OnboardingMarker> {
    return readJson<OnboardingMarker>(onboardingPath, { completed: false });
  }

  async getLock(): Promise<unknown> {
    return readJson<unknown>(lockPath, null);
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    return summarizeConfig(await readConfig());
  }

  async getState(): Promise<BrandState> {
    const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, configResult] = await Promise.all([
      this.getSnapshot(),
      this.getDecisions(),
      this.getAgentTasks(),
      this.getExecutionReport(),
      this.getOnboarding(),
      this.getLock(),
      readConfig(),
    ]);
    return {
      data_provider: process.env.KELLY_BRAND_DATA_PROVIDER || this.#meta.config?.data_provider || this.name,
      onboarding,
      lock,
      config_summary: summarizeConfig(configResult),
      decisions,
      agent_tasks: agentTasks,
      execution_report: executionReport,
      snapshot,
    };
  }

  async applyDecision(payload: DecisionInput = {}): Promise<DecisionsFile> {
    const itemId = String(payload.item_id || "");
    const action = String(payload.action || "");
    if (!itemId) {
      const error: HttpError = new Error("item_id is required");
      error.statusCode = 400;
      throw error;
    }
    if (!DECISION_ACTIONS.has(action)) {
      const error: HttpError = new Error(`Unsupported action: ${action}`);
      error.statusCode = 400;
      throw error;
    }
    const now = new Date().toISOString();
    const decisions = await this.getDecisions();
    decisions.decisions[itemId] = {
      action,
      comment: String(payload.comment || ""),
      draft: payload.draft === undefined ? undefined : String(payload.draft),
      decided_at: now,
    };
    decisions.updated_at = now;
    await writeJson(decisionsPath, decisions);
    if (action === "request_changes") {
      const tasks = await this.getAgentTasks();
      tasks.tasks = tasks.tasks.filter((task) => task.item_id !== itemId);
      tasks.tasks.push({
        task_id: `task-${itemId}-${Date.now()}`,
        type: "revise_narrative",
        item_id: itemId,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        requested_at: now,
        status: "queued",
      });
      tasks.updated_at = now;
      await writeJson(agentTasksPath, tasks);
    }
    return decisions;
  }

  async completeOnboarding(marker: Partial<OnboardingMarker> = {}): Promise<OnboardingMarker> {
    const record: OnboardingMarker = {
      completed: true,
      completed_at: marker.completed_at || new Date().toISOString(),
      config_version: marker.config_version,
    };
    await writeJson(onboardingPath, record);
    return record;
  }

  async writeExecutionReport(report: Record<string, unknown>): Promise<Record<string, unknown>> {
    await fs.mkdir(dataDir, { recursive: true });
    await writeJson(executionReportPath, report);
    return report;
  }
}

export function createLocalFileProvider(meta: ProviderMeta = {}): LocalFileProvider {
  return new LocalFileProvider(meta);
}
