// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same approve-before-send model Busabase serves
// remotely, so KELLY_CAMPAIGNS_DATA_PROVIDER=local|busabase is a config switch,
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
import type { DecisionBody, Esp, FromIdentity, ProviderMeta, Segment } from "../types.ts";

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
    source: "kelly-campaigns",
    list_health: {
      subscriber_count: 0,
      bounce_rate: 0,
      complaint_rate: 0,
      churn_rate: 0,
      avg_open_rate: 0,
      avg_click_rate: 0,
    },
    metrics: {
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      scheduled: 0,
      at_risk: 0,
    },
    segments: [],
    sends: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No campaign snapshot exists yet. Give the skill a brief or audience, then let it draft sends for review.",
      },
    ],
  };
}

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const operator = config.operator || {};
  const brand = config.brand || {};
  const esp: Esp = config.esp || {};
  const policy = config.sending_policy || {};
  const identities: FromIdentity[] = Array.isArray(config.from_identities) ? config.from_identities : [];
  const segments: Segment[] = Array.isArray(config.segments) ? config.segments : [];
  const espSecretKeys = ["api_key_env", "token_env", "password_env"].filter((key) => esp[key]);
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    brand: {
      name: brand.name || "",
      homepage: brand.homepage || "",
      unsubscribe_url: brand.unsubscribe_url || "",
    },
    esp: {
      provider: esp.provider || "",
      display_name: esp.display_name || esp.provider || "",
      secret_envs: espSecretKeys.map((key) => esp[key]),
      secrets_ready: espSecretKeys.length > 0 && espSecretKeys.every((key) => Boolean(process.env[esp[key] as string])),
    },
    from_identities: identities.map((identity) => ({
      identity_id: identity.identity_id || "",
      from_name: identity.from_name || "",
      from_email: identity.from_email || "",
      reply_to: identity.reply_to || "",
      use_when: Array.isArray(identity.use_when) ? identity.use_when : [],
    })),
    segments: segments.map((segment) => ({
      segment_id: segment.segment_id || "",
      name: segment.name || segment.segment_id || "",
      description: segment.description || "",
    })),
    sending_policy: {
      approval_required: policy.approval_required !== false,
      daily_send_cap: Number(policy.daily_send_cap || 0),
      hourly_send_cap: Number(policy.hourly_send_cap || 0),
      min_inbox_readiness: Number(policy.min_inbox_readiness || 0),
      max_spam_score: Number(policy.max_spam_score || 0),
    },
    style_tone: (config.style as { tone?: string } | undefined)?.tone || "",
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
      const sendId = String(payload.send_id || "");
      const action = String(payload.action || "");
      if (!sendId) throw new Error("send_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[sendId] = {
        action,
        comment: String(payload.comment || ""),
        body: payload.body === undefined ? undefined : String(payload.body),
        chosen_variant: payload.chosen_variant === undefined ? undefined : String(payload.chosen_variant),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(decisionsPath, decisions);
      if (action === "request_changes") {
        const tasks = await this.readAgentTasks();
        tasks.tasks = tasks.tasks.filter((task: { send_id?: string }) => task.send_id !== sendId);
        tasks.tasks.push({
          task_id: `task-${sendId}-${Date.now()}`,
          type: "revise_send",
          send_id: sendId,
          comment: String(payload.comment || ""),
          body: payload.body === undefined ? undefined : String(payload.body),
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
