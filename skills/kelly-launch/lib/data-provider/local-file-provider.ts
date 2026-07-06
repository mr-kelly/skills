// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same launch-review model Busabase serves
// remotely, so KELLY_LAUNCH_DATA_PROVIDER=local|busabase is a config switch,
// not a rewrite of hono.ts, the scripts, or the UI.
//
// This file is a straight lift of the fs logic that used to live in
// app/server/store.ts — same paths, same JSON shapes, same defaults — so
// `/api/state` is byte-identical to before the retrofit.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type { ConfigResult, DecisionBody, HttpError, ProviderMeta } from "../types.ts";
import { DECISION_ACTIONS, summarizeConfig } from "./provider-interface.ts";

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

export function emptySnapshot(): Record<string, unknown> {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-launch",
    product: { name: "", tagline: "", homepage: "", category: "" },
    launch: { target_date: "", timezone: "UTC" },
    phases: ["research", "assemble", "mobilize", "prove"],
    readiness: { verdict: "BLOCK", lqs: 0, ship: 0, fix: 0, block: 0, blockers: [] },
    metrics: {
      item_count: 0,
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      ship: 0,
      fix: 0,
      block: 0,
    },
    channels: [],
    items: [],
    runbook: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No launch plan exists yet. Tell the skill about the product and target date, then let it assemble the RAMP checklist.",
      },
    ],
  };
}

const DECISION_ACTION_SET = new Set<string>(DECISION_ACTIONS);

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async readSnapshot(): Promise<Record<string, unknown>> {
      return readJson(SNAPSHOT_PATH, emptySnapshot());
    },

    async readDecisions(): Promise<Record<string, unknown>> {
      return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async readAgentTasks(): Promise<Record<string, unknown>> {
      return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
    },

    async readExecutionReport(): Promise<Record<string, unknown> | null> {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async readOnboarding(): Promise<Record<string, unknown>> {
      return readJson(ONBOARDING_PATH, { completed: false });
    },

    async readLock(): Promise<Record<string, unknown> | null> {
      return readJson(LOCK_PATH, null);
    },

    async readConfig(): Promise<ConfigResult> {
      // meta was populated from the same search paths in index.ts; prefer it so
      // config is loaded once, but keep the original fallback shape.
      if (meta.source) {
        return { config: meta.config || { channels: [] }, path: meta.source, is_example: Boolean(meta.is_example) };
      }
      return { config: { channels: [] }, path: "", is_example: false };
    },

    configSummary(): Record<string, unknown> {
      // getState() awaits readConfig() and passes the result; but the interface
      // guard also allows a standalone summary. Build it from meta here.
      return summarizeConfig({
        config: meta.config || { channels: [] },
        path: meta.source || "",
        is_example: Boolean(meta.is_example),
      });
    },

    async getState(): Promise<Record<string, unknown>> {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
      ]);
      return {
        data_provider: "local",
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot,
      };
    },

    async applyDecision(payload: DecisionBody = {}): Promise<Record<string, unknown>> {
      const itemId = String(payload.item_id || "");
      const action = String(payload.action || "");
      if (!itemId) {
        const error: HttpError = new Error("item_id is required");
        error.statusCode = 400;
        throw error;
      }
      if (!DECISION_ACTION_SET.has(action)) {
        const error: HttpError = new Error(`Unsupported action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      const now = new Date().toISOString();
      const decisions = (await this.readDecisions()) as {
        updated_at: string;
        decisions: Record<string, unknown>;
      };
      decisions.decisions[itemId] = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      if (action === "request_changes") {
        const tasks = (await this.readAgentTasks()) as {
          updated_at: string;
          tasks: Array<Record<string, unknown>>;
        };
        tasks.tasks = tasks.tasks.filter((task) => task.item_id !== itemId);
        tasks.tasks.push({
          task_id: `task-${itemId}-${Date.now()}`,
          type: "revise_item",
          item_id: itemId,
          comment: String(payload.comment || ""),
          draft: payload.draft === undefined ? undefined : String(payload.draft),
          requested_at: now,
          status: "queued",
        });
        tasks.updated_at = now;
        await writeJson(AGENT_TASKS_PATH, tasks);
      }
      return decisions;
    },

    async writeExecutionReport(report: Record<string, unknown>): Promise<void> {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async writeSnapshot(snapshot: Record<string, unknown>): Promise<void> {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },
  };
}

// Re-exported so app/server/index.ts (launcher-time setup) can ensure the data
// dir exists exactly as the old store.ensureDirs() did.
export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
