// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files (standup_snapshot.json,
// decisions.json, agent_tasks.json, execution_report.json, onboarding.json) plus
// the agent.lock write-lock. This provider is the offline reference
// implementation of the same standup-board model Busabase serves remotely, so
// KELLY_STANDUP_DATA_PROVIDER=local|busabase is a config switch, not a rewrite of
// the UI or scripts. The fs logic here is the store.ts logic verbatim, so
// /api/state is byte-identical to before the retrofit.

import fs from "node:fs/promises";
import {
  REMINDER_ACTIONS,
  ensureDirs,
  mergeSnapshot,
  readAgentTasks,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readOnboarding,
  readSnapshot,
  summarizeConfig,
  writeJson,
} from "../common.ts";
import { AGENT_TASKS_PATH, DECISIONS_PATH, EXECUTION_REPORT_PATH, LOCK_PATH, SNAPSHOT_PATH } from "../paths.ts";
import type {
  AgentTask,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  Decisions,
  ExecutionReport,
  Lock,
  ProviderMeta,
  StandupSnapshot,
  StatePayload,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

export class LocalFileProvider implements DataProvider {
  readonly kind = "local";
  private meta: ProviderMeta;

  constructor(meta: ProviderMeta = {}) {
    this.meta = meta;
  }

  async getState(): Promise<StatePayload> {
    const [snapshot, onboarding, lock, configResult, decisions, agentTasks, executionReport] = await Promise.all([
      readSnapshot(),
      readOnboarding(),
      readLock(),
      readConfig(),
      readDecisions(),
      readAgentTasks(),
      readExecutionReport(),
    ]);
    return {
      app: "kelly-standup",
      data_provider: "local",
      onboarding,
      lock,
      config_summary: summarizeConfig(configResult),
      agent_tasks: agentTasks,
      execution_report: executionReport,
      snapshot: mergeSnapshot(snapshot, decisions, executionReport),
    };
  }

  configSummary(): ConfigSummary {
    // Synchronous summary of the config loaded at provider creation. getState()
    // is the primary path (it re-reads config so contact_ready reflects live
    // env), so this exists mainly to satisfy the interface for symmetry with the
    // busabase provider and for callers that only want the roster.
    return summarizeConfig(
      this.meta.configResult ?? {
        config: { members: [] },
        path: this.meta.source || "",
        is_example: this.meta.is_example ?? false,
      },
    );
  }

  async getLock(): Promise<Lock | null> {
    return readLock();
  }

  async getSnapshot(): Promise<StandupSnapshot> {
    return readSnapshot();
  }

  async putSnapshot(snapshot: StandupSnapshot): Promise<{ ok: boolean }> {
    await writeJson(SNAPSHOT_PATH, snapshot);
    return { ok: true };
  }

  async getDecisions(): Promise<Decisions> {
    return readDecisions();
  }

  async getExecutionReport(): Promise<ExecutionReport | null> {
    return readExecutionReport();
  }

  async putExecutionReport(report: ExecutionReport): Promise<{ ok: boolean }> {
    await writeJson(EXECUTION_REPORT_PATH, report);
    return { ok: true };
  }

  async listAgentTasks(): Promise<AgentTask[]> {
    const store = await readAgentTasks();
    return store.tasks || [];
  }

  async withLock<T>(message: string, fn: () => Promise<T>): Promise<T> {
    await ensureDirs();
    await writeJson(LOCK_PATH, {
      owner: "kelly-standup",
      message,
      started_at: new Date().toISOString(),
    });
    try {
      return await fn();
    } finally {
      await fs.rm(LOCK_PATH, { force: true });
    }
  }

  async saveDecision({ id, action, note, draft }: DecisionInput): Promise<DecisionResult> {
    const snapshot = await readSnapshot();
    const reminder = (snapshot.reminders || []).find((item) => item.id === id);
    if (!reminder) {
      return { ok: false, status: 404, error: `Unknown reminder id: ${id}` };
    }
    if (!REMINDER_ACTIONS.has(action)) {
      return { ok: false, status: 400, error: `Unknown action for reminders: ${action}` };
    }
    const now = new Date().toISOString();
    const decisions = await readDecisions();
    decisions.decisions[id] = {
      action,
      note: String(note || ""),
      draft: typeof draft === "string" ? draft : null,
      decided_at: now,
    };
    decisions.updated_at = now;
    await writeJson(DECISIONS_PATH, decisions);

    const tasks = await readAgentTasks();
    tasks.tasks = (tasks.tasks || []).filter((task) => task.id !== id);
    if (action === "request_changes") {
      tasks.tasks.push({
        id,
        ref: reminder.ref,
        title: reminder.title,
        type: "revise_reminder",
        note: String(note || ""),
        requested_at: now,
      });
    }
    tasks.updated_at = now;
    await writeJson(AGENT_TASKS_PATH, tasks);
    return { ok: true };
  }
}

export function createLocalFileProvider(meta: ProviderMeta = {}): LocalFileProvider {
  return new LocalFileProvider(meta);
}
