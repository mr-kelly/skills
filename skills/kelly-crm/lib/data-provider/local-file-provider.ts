// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same follow-up-review model Busabase serves
// remotely, so KELLY_CRM_DATA_PROVIDER=local|busabase is a config switch, not a
// rewrite of the UI or scripts. The read/write logic here is moved verbatim from
// the original app/server/store.ts and keeps reading the SAME app/.data/*.json
// paths, so /api/state output and decision/execution behavior are unchanged.

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
import type { Channel, DecisionBody, ProviderMeta } from "../types.ts";

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
    source: "kelly-crm",
    base_currency: "USD",
    pipeline_stages: ["lead", "qualified", "proposal", "negotiation", "won", "lost"],
    metrics: {
      contact_count: 0,
      company_count: 0,
      deal_count: 0,
      open_deal_count: 0,
      pipeline_value: 0,
      weighted_pipeline_value: 0,
      followups_needs_review: 0,
      followups_due: 0,
    },
    companies: [],
    contacts: [],
    deals: [],
    interactions: [],
    followups: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No CRM snapshot exists yet. Feed the skill emails or meeting notes, then let it generate one.",
      },
    ],
  };
}

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const channels: Channel[] = Array.isArray(config.channels) ? config.channels : [];
  const operator = config.operator || {};
  const pipeline = config.pipeline || {};
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    pipeline_stages: Array.isArray(pipeline.stages) ? pipeline.stages : [],
    base_currency: pipeline.base_currency || "USD",
    style_tone: config.style?.tone || "",
    channels: channels.map((channel) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        handoff_skill: channel.handoff_skill || "",
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key] as string])),
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
      const followupId = String(payload.followup_id || "");
      const action = String(payload.action || "");
      if (!followupId) throw new Error("followup_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[followupId] = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(decisionsPath, decisions);
      if (action === "request_changes") {
        const tasks = await this.readAgentTasks();
        tasks.tasks = tasks.tasks.filter((task: { followup_id?: string }) => task.followup_id !== followupId);
        tasks.tasks.push({
          task_id: `task-${followupId}-${Date.now()}`,
          type: "revise_followup",
          followup_id: followupId,
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
