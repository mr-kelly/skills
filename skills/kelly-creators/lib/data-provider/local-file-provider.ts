// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same creator-review model Busabase serves
// remotely, so KELLY_CREATORS_DATA_PROVIDER=local|busabase is a config switch,
// not a rewrite of the UI or scripts. The read/write logic here is moved
// verbatim from the original app/server/store.ts and keeps reading the SAME
// app/.data/*.json paths, so /api/state output and decision/execution behavior
// are unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import {
  agentTasksPath,
  dataDir,
  decisionsPath,
  executionReportPath,
  lockPath,
  onboardingPath,
  snapshotPath,
} from "../paths.ts";
import type { Brand, DecisionBody, Platform, ProviderMeta } from "../types.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

async function readJson(file: string, fallback = null) {
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

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-creators",
    base_currency: "USD",
    pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
    metrics: {
      creator_count: 0,
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      total_reach: 0,
      budget_total: 0,
      budget_allocated: 0,
      est_value: 0,
    },
    creators: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No creator snapshot exists yet. Feed the skill a niche, brand brief, or candidate list, then let it sweep and score creators.",
      },
    ],
  };
}

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const platforms: Platform[] = Array.isArray(config.platforms) ? config.platforms : [];
  const operator = config.operator || {};
  const program = config.program || {};
  const brands: Brand[] = Array.isArray(config.brands) ? config.brands : [];
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    program: {
      base_currency: program.base_currency || "USD",
      budget_total: Number(program.budget_total || 0),
      target_niches: Array.isArray(program.target_niches) ? program.target_niches : [],
    },
    brands: brands.map((brand) => ({
      brand_id: brand.brand_id || "",
      display_name: brand.display_name || brand.brand_id || "",
      positioning: brand.positioning || "",
    })),
    style_tone: config.style?.tone || "",
    platforms: platforms.map((platform) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => platform[key]);
      return {
        platform_id: platform.platform_id || "",
        type: platform.type || "",
        display_name: platform.display_name || platform.platform_id || "",
        handoff_skill: platform.handoff_skill || "",
        secret_envs: secretKeys.map((key) => platform[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[platform[key] as string])),
      };
    }),
  };
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getState() {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock] = await Promise.all([
        this.readSnapshot(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readOnboarding(),
        this.readLock(),
      ]);
      return {
        data_provider: "local",
        onboarding,
        lock,
        config_summary: await this.configSummary(),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot,
      };
    },

    async configSummary() {
      return { provider: "local", ...summarizeConfig(meta) };
    },

    async readSnapshot() {
      return readJson(snapshotPath, emptySnapshot() as unknown as null);
    },

    async readDecisions() {
      return readJson(decisionsPath, { updated_at: "", decisions: {} } as unknown as null);
    },

    async readAgentTasks() {
      return readJson(agentTasksPath, { updated_at: "", tasks: [] } as unknown as null);
    },

    async readExecutionReport() {
      return readJson(executionReportPath, null);
    },

    async readOnboarding() {
      return readJson(onboardingPath, { completed: false } as unknown as null);
    },

    async readLock() {
      return readJson(lockPath, null);
    },

    async applyDecision(payload: DecisionBody = {}) {
      const creatorId = String(payload.creator_id || "");
      const action = String(payload.action || "");
      if (!creatorId) throw new Error("creator_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[creatorId] = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(decisionsPath, decisions);
      if (action === "request_changes") {
        const tasks = await this.readAgentTasks();
        tasks.tasks = tasks.tasks.filter((task: { creator_id?: string }) => task.creator_id !== creatorId);
        tasks.tasks.push({
          task_id: `task-${creatorId}-${Date.now()}`,
          type: "revise_outreach",
          creator_id: creatorId,
          comment: String(payload.comment || ""),
          draft: payload.draft === undefined ? undefined : String(payload.draft),
          requested_at: now,
          status: "queued",
        });
        tasks.updated_at = now;
        await writeJson(agentTasksPath, tasks);
      }
      return decisions;
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      await fs.mkdir(dataDir, { recursive: true });
      await writeJson(snapshotPath, snapshot);
      return { ok: true, path: snapshotPath };
    },

    async writeExecutionReport(report: Record<string, unknown>) {
      await fs.mkdir(dataDir, { recursive: true });
      await writeJson(executionReportPath, report);
      return { ok: true, path: executionReportPath };
    },
  };
}
