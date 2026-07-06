// Local-file TicketsProvider: the zero-dependency default.
//
// State lives in app/.data/*.json exactly where the pre-refactor store.ts wrote
// it, so KELLY_TICKETS_DATA_PROVIDER=local|busabase is a config switch, not a
// rewrite of the UI or scripts. This provider is the offline reference
// implementation of the complaint-desk store surface Busabase serves remotely.

import fs from "node:fs/promises";
import { mergeSnapshot, readConfig, readJson, summarizeConfig, writeJson } from "../common.ts";
import { emptySnapshot } from "../common.ts";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasks,
  ConfigResult,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  ProviderMeta,
  Snapshot,
  TicketsState,
} from "../types.ts";
import type { TicketsProvider } from "./provider-interface.ts";

const PROPOSAL_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
const INTAKE_ACTIONS = new Set(["convert_to_ticket", "ignore"]);
const TICKET_ACTIONS = new Set(["revise"]);

export function createLocalFileProvider(meta: ProviderMeta = {}): TicketsProvider {
  return {
    kind: "local",

    async ensureStore() {
      await fs.mkdir(DATA_DIR, { recursive: true });
    },

    async readSnapshot(): Promise<Snapshot> {
      return readJson<Snapshot>(SNAPSHOT_PATH, emptySnapshot());
    },

    async writeSnapshot(snapshot: Snapshot) {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async readConfig(): Promise<ConfigResult> {
      return readConfig();
    },

    async readLock(): Promise<Lock | null> {
      return readJson<Lock | null>(LOCK_PATH, null);
    },

    async writeLock(lock: Lock) {
      await writeJson(LOCK_PATH, lock);
    },

    async clearLock() {
      await fs.rm(LOCK_PATH, { force: true });
    },

    async readDecisions(): Promise<DecisionsFile> {
      return readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async readAgentTasks(): Promise<AgentTasks> {
      return readJson<AgentTasks>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
    },

    async readOnboarding(): Promise<Onboarding> {
      return readJson<Onboarding>(ONBOARDING_PATH, { completed: false });
    },

    async readExecutionReport(): Promise<ExecutionReport | null> {
      return readJson<ExecutionReport | null>(EXECUTION_REPORT_PATH, null);
    },

    async writeExecutionReport(report: ExecutionReport) {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    configSummary(): ConfigSummary {
      // meta.config is the config resolved at createProvider() time; but the UI
      // has always summarized the freshly-read config file. Keep that behavior:
      // callers that want the live summary use getState(); this synchronous
      // helper summarizes whatever config the loader resolved.
      return summarizeConfig(
        meta.source
          ? { config: meta.config || {}, path: meta.source, is_example: Boolean(meta.is_example) }
          : { config: meta.config || { crews: [] }, path: "", is_example: false },
      );
    },

    async getState(): Promise<TicketsState> {
      const [snapshot, onboarding, lock, configResult, decisions, agentTasks, executionReport] = await Promise.all([
        this.readSnapshot(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
      ]);
      return {
        app: "kelly-tickets",
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot: mergeSnapshot(snapshot, decisions, executionReport),
      };
    },

    async submitDecision({ id, action, note, draft, fields }: DecisionInput): Promise<DecisionResult> {
      const snapshot = await this.readSnapshot();
      const proposal = (snapshot.dispatch_proposals || []).find((item) => item.id === id);
      const intakeItem = proposal ? null : (snapshot.intake || []).find((item) => item.id === id);
      const ticket = proposal || intakeItem ? null : (snapshot.tickets || []).find((item) => item.id === id);
      if (!proposal && !intakeItem && !ticket) {
        return { ok: false, status: 404, error: `Unknown item id: ${id}` };
      }
      const allowed = proposal ? PROPOSAL_ACTIONS : intakeItem ? INTAKE_ACTIONS : TICKET_ACTIONS;
      if (!allowed.has(action)) {
        return { ok: false, status: 400, error: `Unknown action for this item: ${action}` };
      }
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[id] = {
        action,
        note: String(note || ""),
        draft: typeof draft === "string" ? draft : null,
        fields: fields && typeof fields === "object" ? fields : null,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);

      const tasks = await this.readAgentTasks();
      tasks.tasks = (tasks.tasks || []).filter((task) => task.id !== id);
      if (proposal && action === "request_changes") {
        tasks.tasks.push({
          id,
          ref: proposal.ref,
          title: proposal.title,
          type: "revise_dispatch",
          note: String(note || ""),
          requested_at: now,
        });
      }
      if (intakeItem && action === "convert_to_ticket") {
        tasks.tasks.push({
          id,
          title: intakeItem.text?.slice(0, 80) || id,
          type: "convert_intake",
          note: String(note || ""),
          fields: fields && typeof fields === "object" ? fields : null,
          requested_at: now,
        });
      }
      tasks.updated_at = now;
      await writeJson(AGENT_TASKS_PATH, tasks);
      return { ok: true };
    },
  };
}
