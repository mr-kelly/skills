// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/*.json — the SAME files app/server/store.ts used
// before the retrofit, so `/api/state` is byte-identical for the pre-existing
// fields. This provider is the offline reference implementation of the same
// review model Busabase serves remotely, so KELLY_CAMPAIGNS_DATA_PROVIDER=
// local|busabase is a config switch, not a rewrite of the UI or scripts.

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
  suppressionPath,
} from "../paths.ts";
import type { DecisionBody, ProviderMeta, SuppressionEntry } from "../types.ts";
import { summarizeConfig } from "./config.ts";
import type { SuppressionCheck } from "./provider-interface.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

async function readJson(file: string, fallback: unknown = null) {
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

function emptySuppression() {
  return { updated_at: "", entries: [] as SuppressionEntry[] };
}

/**
 * Match a send against the suppression list. A send targets a segment (and may
 * carry an explicit `target_addresses` list). Segment-level suppressions exclude
 * recipients (a soft note); an explicitly-targeted suppressed ADDRESS is a hard
 * block — the send must not go out to someone who unsubscribed/complained.
 */
export function checkSuppression(send: Record<string, unknown>, entries: SuppressionEntry[]): SuppressionCheck {
  const segmentId = String(send.segment_id || "");
  const targetAddresses = Array.isArray(send.target_addresses)
    ? (send.target_addresses as unknown[]).map((value) => String(value).toLowerCase())
    : [];
  const matched: SuppressionEntry[] = [];
  let blocked = false;
  for (const entry of entries) {
    if (entry.segment_id && entry.segment_id === segmentId) {
      matched.push(entry);
    } else if (entry.address) {
      const address = String(entry.address).toLowerCase();
      // Segment-level suppression of an address excludes it from the count;
      // an explicitly-targeted suppressed address hard-blocks the send.
      matched.push(entry);
      if (targetAddresses.includes(address)) blocked = true;
    }
  }
  const suppressedCount = matched.length;
  const note = blocked
    ? `${suppressedCount} suppressed recipient(s) matched — a suppressed address is explicitly targeted; blocking send.`
    : suppressedCount
      ? `${suppressedCount} suppressed recipient(s) excluded.`
      : "";
  return { suppressed_count: suppressedCount, blocked, matched, note };
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    name: "local",

    async getConfigSummary() {
      return summarizeConfig(meta);
    },

    async getLock() {
      return readJson(lockPath, null);
    },

    async getAgentTasks() {
      return readJson(agentTasksPath, { updated_at: "", tasks: [] });
    },

    async getSuppression() {
      return readJson(suppressionPath, emptySuppression());
    },

    async evaluateSuppression(send: Record<string, unknown>): Promise<SuppressionCheck> {
      const suppression = (await readJson(suppressionPath, emptySuppression())) as {
        entries?: SuppressionEntry[];
      };
      return checkSuppression(send, suppression.entries || []);
    },

    async getState() {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, suppression] = await Promise.all([
        readJson(snapshotPath, emptySnapshot()),
        readJson(decisionsPath, { updated_at: "", decisions: {} }),
        readJson(agentTasksPath, { updated_at: "", tasks: [] }),
        readJson(executionReportPath, null),
        readJson(onboardingPath, { completed: false }),
        readJson(lockPath, null),
        readJson(suppressionPath, emptySuppression()),
      ]);
      return {
        app: "kelly-campaigns",
        data_provider: "local",
        onboarding,
        lock,
        config_summary: summarizeConfig(meta),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        suppression,
        snapshot,
      };
    },

    async applyDecision(payload: DecisionBody = {}) {
      const sendId = String(payload.send_id || "");
      const action = String(payload.action || "");
      if (!sendId) throw new Error("send_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = (await readJson(decisionsPath, { updated_at: "", decisions: {} })) as {
        updated_at: string;
        decisions: Record<string, unknown>;
      };
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
        const tasks = (await readJson(agentTasksPath, { updated_at: "", tasks: [] })) as {
          updated_at: string;
          tasks: { send_id?: string }[];
        };
        tasks.tasks = tasks.tasks.filter((task) => task.send_id !== sendId);
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
  };
}

export async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
}
