// Local-file DataProvider: the zero-dependency default.
//
// Ops state lives in app/.data/*.json exactly as it did in the pre-retrofit
// store.ts (ops_snapshot.json, decisions.json, onboarding.json,
// agent_tasks.json, agent.lock). This provider is the offline reference
// implementation of the same review model Busabase serves remotely, so
// KELLY_DEVOPS_DATA_PROVIDER=local|busabase is a config switch, not a rewrite
// of the UI or the scripts. The JSON written here is byte-identical to what the
// original store produced.

import fs from "node:fs/promises";
import { emptySnapshot, readConfig, readJson, summarizeConfig, writeJson } from "../common.ts";
import { AGENT_TASKS_PATH, DECISIONS_PATH, LOCK_PATH, ONBOARDING_PATH, SNAPSHOT_PATH } from "../paths.ts";
import type {
  AgentTask,
  AgentTasksFile,
  ConfigSummary,
  Decision,
  DecisionInput,
  DecisionsFile,
  DevopsSnapshot,
  DevopsState,
  Lock,
  Onboarding,
  OpsAction,
  ProviderMeta,
} from "../types.ts";

const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

const VERDICT_STATUS: Record<string, string> = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

// `meta` is accepted for parity with the Busabase provider; the local provider
// loads config fresh via readConfig() on each read, matching the original store.
export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  async function getSnapshot(): Promise<DevopsSnapshot> {
    return (await readJson<DevopsSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as DevopsSnapshot;
  }

  async function saveSnapshot(snapshot: DevopsSnapshot): Promise<void> {
    await writeJson(SNAPSHOT_PATH, snapshot);
  }

  async function getOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async function completeOnboarding(marker: Partial<Onboarding> = {}): Promise<Onboarding> {
    const onboarding: Onboarding = {
      completed: true,
      completed_at: marker.completed_at || new Date().toISOString(),
      ...marker,
    };
    onboarding.completed = marker.completed ?? true;
    await writeJson(ONBOARDING_PATH, onboarding);
    return onboarding;
  }

  async function getLock(): Promise<Lock | null> {
    return readJson<Lock>(LOCK_PATH, null);
  }

  async function acquireLock(owner: string, message: string): Promise<void> {
    const existing = await getLock();
    if (existing && existing.owner !== owner) {
      const error = new Error(
        `Agent lock is held by ${existing.owner || "unknown"}: ${existing.message || "working"}`,
      ) as NodeJS.ErrnoException;
      error.code = "LOCKED";
      throw error;
    }
    await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
  }

  async function releaseLock(): Promise<void> {
    await fs.rm(LOCK_PATH, { force: true });
  }

  async function getDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, { decisions: {} })) as DecisionsFile;
  }

  async function getConfigSummary(): Promise<ConfigSummary> {
    return summarizeConfig(await readConfig());
  }

  async function getAgentTasks(): Promise<AgentTask[]> {
    const store = (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { tasks: [] })) || { tasks: [] };
    return Array.isArray(store.tasks) ? store.tasks : [];
  }

  return {
    name: "local",

    getSnapshot,
    saveSnapshot,
    getDecisions,
    getOnboarding,
    completeOnboarding,
    getLock,
    acquireLock,
    releaseLock,
    getConfigSummary,
    getAgentTasks,

    async getState(): Promise<DevopsState> {
      const [snapshot, onboarding, lock, configResult] = await Promise.all([
        getSnapshot(),
        getOnboarding(),
        getLock(),
        readConfig(),
      ]);
      return {
        app: "kelly-devops",
        data_provider: "local",
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async applyDecision({
      action_id,
      verdict,
      note,
    }: DecisionInput): Promise<{ action: OpsAction; decision: Decision }> {
      if (!action_id || typeof action_id !== "string") throw new Error("action_id is required");
      if (!verdict || !VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
      const lock = await getLock();
      if (lock) {
        const error = new Error(
          `Agent lock is held by ${lock.owner || "unknown"}: ${lock.message || "working"}`,
        ) as NodeJS.ErrnoException;
        error.code = "LOCKED";
        throw error;
      }
      const snapshot = await getSnapshot();
      const action = (snapshot.actions || []).find((item) => item.action_id === action_id);
      if (!action) throw new Error(`Unknown action: ${action_id}`);
      const decidedAt = new Date().toISOString();
      const decision: Decision = {
        action_id,
        verdict,
        note: typeof note === "string" ? note : "",
        decided_at: decidedAt,
      };
      if (verdict !== "note") action.status = VERDICT_STATUS[verdict];
      action.decision = decision;
      if (typeof note === "string") action.note = note;

      const decisions = await getDecisions();
      decisions.decisions = decisions.decisions || {};
      decisions.decisions[action_id] = decision;
      decisions.updated_at = decidedAt;

      snapshot.metrics.actions_needing_review = (snapshot.actions || []).filter(
        (item) => item.status === "needs_review",
      ).length;

      await writeJson(DECISIONS_PATH, decisions);
      await writeJson(SNAPSHOT_PATH, snapshot);

      if (verdict === "request_changes") {
        const tasks: AgentTasksFile = (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { tasks: [] })) || {
          tasks: [],
        };
        tasks.tasks = Array.isArray(tasks.tasks) ? tasks.tasks.filter((task) => task.action_id !== action_id) : [];
        tasks.tasks.push({
          task_id: `task-${action_id}-${Date.now()}`,
          action_id,
          type: action.type || "",
          title: action.title || "",
          request: decision.note,
          status: "queued",
          created_at: decidedAt,
        });
        tasks.updated_at = decidedAt;
        await writeJson(AGENT_TASKS_PATH, tasks);
      }

      return { action, decision };
    },
  };
}
