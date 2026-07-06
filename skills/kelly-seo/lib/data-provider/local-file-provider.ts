// Local-file SeoDataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON files (seo_snapshot.json, decisions.json,
// agent_tasks.json, execution_report.json, onboarding.json, agent.lock). This is
// the offline reference implementation of the same review model Busabase serves
// remotely, so KELLY_SEO_DATA_PROVIDER=local|busabase is a config switch, not a
// rewrite of the UI or scripts. Every file path and JSON shape here is
// byte-identical to the former app/server/store.ts, so /api/state is unchanged.

import fs from "node:fs/promises";
import { emptySnapshot, ensureDirs, mergeOpportunities, readJson, summarizeConfig, writeJson } from "../common.ts";
import {
  AGENT_TASKS_PATH,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type { ProviderMeta, SeoSnapshot } from "../types.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getSnapshot(): Promise<SeoSnapshot> {
      return readJson(SNAPSHOT_PATH, emptySnapshot());
    },

    async getOnboarding() {
      return readJson(ONBOARDING_PATH, { completed: false });
    },

    async getLock() {
      return readJson(LOCK_PATH, null);
    },

    async getDecisions() {
      return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async getAgentTasks() {
      return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
    },

    async getExecutionReport() {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async configSummary() {
      return summarizeConfig(meta);
    },

    async getState() {
      const [snapshot, onboarding, lock, decisions, agentTasks, executionReport] = await Promise.all([
        this.getSnapshot(),
        this.getOnboarding(),
        this.getLock(),
        this.getDecisions(),
        this.getAgentTasks(),
        this.getExecutionReport(),
      ]);
      return {
        onboarding,
        lock,
        config_summary: summarizeConfig(meta),
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot: mergeOpportunities(snapshot, decisions, executionReport),
      };
    },

    async saveDecision({ id, action, note, draft }) {
      if (!DECISION_ACTIONS.has(action)) {
        return { ok: false, status: 400, error: `Unknown action: ${action}` };
      }
      const snapshot = await this.getSnapshot();
      const opportunity = (snapshot.opportunities || []).find((item) => item.id === id);
      if (!opportunity) {
        return { ok: false, status: 404, error: `Unknown opportunity id: ${id}` };
      }
      const now = new Date().toISOString();
      const decisions = await this.getDecisions();
      decisions.decisions[id] = {
        action,
        note: String(note || ""),
        draft: typeof draft === "string" ? draft : null,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);

      const tasks = await this.getAgentTasks();
      tasks.tasks = (tasks.tasks || []).filter((task) => task.id !== id);
      if (action === "request_changes") {
        tasks.tasks.push({
          id,
          ref: opportunity.ref,
          title: opportunity.title,
          type: "revise_opportunity",
          note: String(note || ""),
          requested_at: now,
        });
      }
      tasks.updated_at = now;
      await writeJson(AGENT_TASKS_PATH, tasks);
      return { ok: true };
    },

    async writeSnapshot(snapshot: SeoSnapshot) {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async writeExecutionReport(report) {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async acquireLock(message: string) {
      // Scripts pre-check getLock() and print their own guidance, so this just
      // writes the lock record (matching the former store.ts control flow).
      const lock = {
        owner: "kelly-seo",
        message,
        started_at: new Date().toISOString(),
      };
      await ensureDirs();
      await writeJson(LOCK_PATH, lock);
      return lock;
    },

    async releaseLock() {
      await fs.rm(LOCK_PATH, { force: true });
    },
  };
}
