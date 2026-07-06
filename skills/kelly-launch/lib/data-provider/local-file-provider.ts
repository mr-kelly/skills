// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same launch-readiness model Busabase serves
// remotely, so KELLY_LAUNCH_DATA_PROVIDER=local|busabase is a config switch, not
// a rewrite of the UI or scripts. The read/write logic here is moved verbatim
// from the original app/server/store.ts and keeps reading the SAME
// app/.data/*.json paths, so /api/state output and decision/execution behavior
// are unchanged.

import fs from "node:fs/promises";
import { readJson, summarizeConfig, writeJson } from "../common.ts";
import {
  agentTasksPath,
  dataDir,
  decisionsPath,
  executionReportPath,
  lockPath,
  onboardingPath,
  snapshotPath,
} from "../paths.ts";
import type { DecisionBody, ProviderMeta } from "../types.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function emptySnapshot() {
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
      return readJson(snapshotPath, emptySnapshot());
    },

    async readDecisions() {
      return readJson(decisionsPath, { updated_at: "", decisions: {} });
    },

    async readAgentTasks() {
      return readJson(agentTasksPath, { updated_at: "", tasks: [] });
    },

    async readExecutionReport() {
      return readJson(executionReportPath, null);
    },

    async readOnboarding() {
      return readJson(onboardingPath, { completed: false });
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
          type: "revise_item",
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
