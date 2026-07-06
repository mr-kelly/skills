// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files (picks_snapshot.json,
// decisions.json, agent_tasks.json, execution_report.json, onboarding.json) plus
// the app/.data/agent.lock write guard. This provider is the offline reference
// implementation of the same review model a remote backend would serve, so
// KELLY_PICKS_DATA_PROVIDER=local|busabase is a config switch, not a rewrite of
// the UI or scripts. Its getState() returns the SAME payload the pre-lib server
// built inline, so /api/state is byte-identical.

import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../config.ts";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import {
  CANDIDATE_ACTIONS,
  DECISION_KINDS,
  PROPOSAL_ACTIONS,
  TREND_ACTIONS,
  applyDecisions,
  emptySnapshot,
  stageForCandidateAction,
  statusForProposalAction,
  summarizeConfig,
} from "../picks-core.ts";
import type {
  AgentTask,
  AgentTasksFile,
  ConfigResult,
  Decision,
  DecisionBody,
  DecisionsFile,
  LockInfo,
  Onboarding,
  PicksSnapshot,
  ProviderMeta,
} from "../types.ts";
import type { DataProvider, PicksState, SaveDecisionResult } from "./provider-interface.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
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

export function createLocalFileProvider(meta: ProviderMeta = {}): DataProvider {
  const provider: DataProvider = {
    kind: "local",

    async ensureReady() {
      await fs.mkdir(DATA_DIR, { recursive: true });
    },

    async readSnapshot() {
      return (await readJson<PicksSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as PicksSnapshot;
    },

    async writeSnapshot(snapshot) {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async readOnboarding() {
      return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
    },

    async readLock() {
      return readJson<LockInfo>(LOCK_PATH, null);
    },

    async readDecisions() {
      return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
    },

    async readAgentTasks() {
      return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
    },

    async readExecutionReport() {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async writeExecutionReport(report) {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async acquireLock(owner: string, message: string) {
      const existing = await this.readLock();
      if (existing) {
        throw new Error(
          `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "working"}). Retry after it is released.`,
        );
      }
      await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
    },

    async releaseLock() {
      await fs.rm(LOCK_PATH, { force: true });
    },

    async readConfig(): Promise<ConfigResult> {
      return readConfig();
    },

    async configSummary() {
      const configResult = await this.readConfig();
      return {
        provider: "local",
        data_provider: "local",
        ...summarizeConfig(configResult),
      };
    },

    async getState(): Promise<PicksState> {
      const [snapshot, onboarding, lock, decisions, agentTasks, executionReport, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readOnboarding(),
        this.readLock(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readConfig(),
      ]);
      return {
        app: "kelly-picks",
        data_provider: process.env.KELLY_PICKS_DATA_PROVIDER || configResult.config.data_provider || "local",
        onboarding,
        lock,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        config_summary: summarizeConfig(configResult),
        snapshot: applyDecisions(snapshot, decisions),
      };
    },

    async saveDecision(body: DecisionBody): Promise<SaveDecisionResult> {
      const lock = await this.readLock();
      if (lock) {
        return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
      }
      const kind = String(body.kind || "");
      const id = String(body.id || "");
      const action = String(body.action || "");
      if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
      if (!id) return { ok: false, status: 400, error: "Missing item id" };
      const allowed = kind === "candidate" ? CANDIDATE_ACTIONS : kind === "proposal" ? PROPOSAL_ACTIONS : TREND_ACTIONS;
      if (!allowed.includes(action)) return { ok: false, status: 400, error: `Unknown action for ${kind}: ${action}` };

      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      const decision: Decision = {
        kind,
        action,
        comment: typeof body.comment === "string" ? body.comment : "",
        decided_at: now,
      };
      if (kind === "candidate") decision.stage = stageForCandidateAction(action);
      if (kind === "proposal") {
        decision.status = statusForProposalAction(action);
        if (typeof body.brief === "string") decision.brief = body.brief;
      }
      decisions.decisions[id] = decision;
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);

      if (kind === "proposal" && (action === "request_changes" || action === "block")) {
        await enqueueAgentTask(this, {
          kind: action === "request_changes" ? "revise_proposal" : "unblock_proposal",
          ref_id: id,
          note: decision.comment,
          created_at: now,
        });
      }
      if (kind === "candidate" && action === "develop") {
        await enqueueAgentTask(this, {
          kind: "draft_development_proposal",
          ref_id: id,
          note: decision.comment,
          created_at: now,
        });
      }
      if (kind === "trend" && action === "promote") {
        await enqueueAgentTask(this, {
          kind: "promote_to_candidate",
          ref_id: id,
          note: decision.comment,
          created_at: now,
        });
      }
      return { ok: true, decision: { id, ...decision } };
    },
  };

  // meta is currently unused by the local provider (config is read fresh on
  // demand), but is accepted so createProvider() can hand it uniformly to every
  // provider; reference it to keep the parameter meaningful.
  void meta;
  return provider;
}

interface AgentTaskEntry {
  kind: string;
  ref_id: string;
  note: string;
  created_at: string;
}

async function enqueueAgentTask(provider: DataProvider, entry: AgentTaskEntry): Promise<AgentTask> {
  const tasks = await provider.readAgentTasks();
  const task: AgentTask = {
    task_id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    status: "queued",
    ...entry,
  };
  tasks.tasks.push(task);
  tasks.updated_at = entry.created_at;
  await writeJson(AGENT_TASKS_PATH, tasks);
  return task;
}
