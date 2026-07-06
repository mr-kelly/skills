// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same narrative-review model Busabase serves
// remotely, so KELLY_BRAND_DATA_PROVIDER=local|busabase is a config switch, not
// a rewrite of the UI or scripts. The read/write logic here is moved verbatim
// from the original app/server/store.ts and keeps reading the SAME
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
import type { Channel, DecisionBody, ProviderMeta } from "../types.ts";

// Verdict verbs are provider-neutral. Here `approve` promotes a narrative asset
// to the canonical brand narrative; `resolve_drift`/`dismiss_drift` act on a
// drift alert instead of a narrative item.
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise", "resolve_drift", "dismiss_drift"]);

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

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const channels: Channel[] = Array.isArray(config.channels) ? config.channels : [];
  const brand = config.brand || {};
  const style = config.style || {};
  const officialUrls = config.official_urls || {};
  const riskPolicy = config.risk_policy || {};
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
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
      const itemId = String(payload.item_id || "");
      const action = String(payload.action || "");
      if (!itemId) throw new Error("item_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[itemId] = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(decisionsPath, decisions);
      if (action === "request_changes") {
        const tasks = await this.readAgentTasks();
        tasks.tasks = tasks.tasks.filter((task: { item_id?: string }) => task.item_id !== itemId);
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
