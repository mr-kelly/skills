// Local-file ReviewProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files — the SAME files the original
// app/server/store.ts wrote. This provider is the offline reference
// implementation of the same review model Busabase serves remotely, so
// KELLY_FEEDBACK_DATA_PROVIDER=local|busabase is a config switch, not a rewrite
// of the UI or scripts.

import fs from "node:fs/promises";
import { emptyDecisions, emptySnapshot, readConfig, readJson, summarizeConfig, writeJson } from "../common.ts";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type { AgentTasks, Decisions, FeedbackSnapshot, Lock, Onboarding, ProviderMeta } from "../types.ts";
import type { ReviewProvider, ReviewState } from "./provider-interface.ts";

const PROPOSAL_ACTIONS = ["approve", "request_changes", "block", "revise"];
const FEEDBACK_ACTIONS = ["assign", "ignore", "insight"];

interface LocalProvider extends ReviewProvider {
  enqueueAgentTask(task: Record<string, unknown>): Promise<void>;
}

export function createLocalFileProvider(meta: ProviderMeta = {}): ReviewProvider {
  const provider: LocalProvider = {
    kind: "local",

    configSummary() {
      // Prefer the loaded config (meta), fall back to a fresh disk read so the
      // summary is identical whether called from getState or standalone.
      if (meta.config) {
        return summarizeConfig({
          config: meta.config,
          path: meta.source || "",
          is_example: Boolean(meta.is_example),
        });
      }
      return { data_provider: "local" };
    },

    async getState(): Promise<ReviewState> {
      const [snapshot, onboarding, lock, decisions, configResult] = await Promise.all([
        this.readSnapshot(),
        readJson<Onboarding>(ONBOARDING_PATH, { completed: false }),
        this.readLock(),
        this.readDecisions(),
        readConfig(),
      ]);
      return {
        onboarding: onboarding as Onboarding,
        lock,
        decisions,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async readSnapshot(): Promise<FeedbackSnapshot> {
      return (await readJson<FeedbackSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as FeedbackSnapshot;
    },

    async writeSnapshot(snapshot: FeedbackSnapshot): Promise<void> {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async readDecisions(): Promise<Decisions> {
      return (await readJson<Decisions>(DECISIONS_PATH, emptyDecisions())) as Decisions;
    },

    async readAgentTasks(): Promise<AgentTasks> {
      return (await readJson<AgentTasks>(AGENT_TASKS_PATH, {
        schema_version: "1",
        updated_at: "",
        tasks: [],
      })) as AgentTasks;
    },

    async writeAgentTasks(tasks: AgentTasks): Promise<void> {
      await writeJson(AGENT_TASKS_PATH, tasks);
    },

    async writeExecutionReport(report: Record<string, unknown>): Promise<void> {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async readLock(): Promise<Lock | null> {
      return readJson<Lock>(LOCK_PATH, null);
    },

    async acquireLock(message: string): Promise<Lock> {
      const existing = await this.readLock();
      if (existing) {
        throw new Error(
          `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "no message"}); refusing to write`,
        );
      }
      const lock: Lock = { owner: "kelly-feedback", message, started_at: new Date().toISOString() };
      await writeJson(LOCK_PATH, lock);
      return lock;
    },

    async releaseLock(): Promise<void> {
      await fs.rm(LOCK_PATH, { force: true });
    },

    async saveDecision(body: Record<string, any>): Promise<Decisions> {
      const decisions = await this.readDecisions();
      const now = new Date().toISOString();
      const kind = String(body.kind || "");
      const id = String(body.id || "");
      if (!id) throw new Error("id is required");
      if (kind === "proposal") {
        const action = String(body.action || "");
        if (!PROPOSAL_ACTIONS.includes(action)) {
          throw new Error(`unsupported proposal action: ${action}`);
        }
        decisions.proposals[id] = {
          action,
          review_note: String(body.review_note || ""),
          draft: typeof body.draft === "string" ? body.draft : undefined,
          decided_at: now,
        };
        if (action === "request_changes") {
          await this.enqueueAgentTask({
            type: "revise_proposal",
            proposal_id: id,
            note: String(body.review_note || ""),
          });
        }
      } else if (kind === "feedback") {
        const action = String(body.action || "");
        if (!FEEDBACK_ACTIONS.includes(action)) {
          throw new Error(`unsupported feedback action: ${action}`);
        }
        decisions.feedback[id] = {
          action,
          request_id: String(body.request_id || ""),
          comment: String(body.comment || ""),
          decided_at: now,
        };
      } else if (kind === "request") {
        decisions.requests[id] = {
          effort_estimate: String(body.effort_estimate || ""),
          comment: String(body.comment || ""),
          decided_at: now,
        };
      } else {
        throw new Error(`unsupported decision kind: ${kind}`);
      }
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      return decisions;
    },

    async enqueueAgentTask(task: Record<string, any>): Promise<void> {
      const tasks = await this.readAgentTasks();
      const now = new Date().toISOString();
      tasks.tasks.push({
        task_id: `task-${Date.now()}-${tasks.tasks.length + 1}`,
        status: "queued",
        created_at: now,
        ...task,
      });
      tasks.updated_at = now;
      await this.writeAgentTasks(tasks);
    },
  };

  return provider;
}

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
