// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This provider is the offline
// reference implementation of the same review model Busabase serves remotely, so
// KELLY_CREATORS_DATA_PROVIDER=local|busabase is a config switch, not a rewrite
// of the UI or scripts. All fs logic that used to live in app/server/store.ts
// now lives here; the on-disk paths are byte-identical.

import fs from "node:fs/promises";
import path from "node:path";
import { summarizeConfig } from "../config.ts";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type { ConfigResult, DecisionBody, ExecuteOptions } from "../types.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

// Map an approved proposed_action to a concrete connector operation. Real sends
// (outreach DMs, briefs, contracts) are delegated to other skills per SKILL.md;
// this only records the intended handoff in execution_report.json.
const OPERATION_BY_ACTION: Record<string, { operation: string; format?: string }> = {
  send_outreach: { operation: "send_outreach" },
  send_brief: { operation: "send_brief", format: "pdf" },
  draft_contract: { operation: "draft_contract", format: "pdf" },
  no_action: { operation: "none" },
};

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-creators",
    base_currency: "USD",
    pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
    metrics: {
      creator_count: 0,
      needs_review: 0,
      approved: 0,
      done: 0,
      blocked: 0,
      total_reach: 0,
      budget_total: 0,
      budget_allocated: 0,
      est_value: 0,
    },
    creators: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No creator snapshot exists yet. Feed the skill a niche, brand brief, or candidate list, then let it sweep and score creators.",
      },
    ],
  };
}

export function createLocalFileProvider(configResult: ConfigResult) {
  const provider = {
    kind: "local",

    async readSnapshot() {
      return readJson(SNAPSHOT_PATH, emptySnapshot());
    },

    async readDecisions() {
      return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async readAgentTasks() {
      return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
    },

    async readExecutionReport() {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async readOnboarding() {
      return readJson(ONBOARDING_PATH, { completed: false });
    },

    async readLock() {
      return readJson(LOCK_PATH, null);
    },

    configSummary() {
      return summarizeConfig(configResult);
    },

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
        app: "kelly-creators",
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: this.configSummary(),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot,
      };
    },

    async applyDecision(payload: DecisionBody = {}) {
      const creatorId = String(payload.creator_id || "");
      const action = String(payload.action || "");
      if (!creatorId) throw new Error("creator_id is required");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[creatorId] = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      if (action === "request_changes") {
        const tasks = await this.readAgentTasks();
        tasks.tasks = tasks.tasks.filter((task) => task.creator_id !== creatorId);
        tasks.tasks.push({
          task_id: `task-${creatorId}-${Date.now()}`,
          type: "revise_outreach",
          creator_id: creatorId,
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

    async writeSnapshot(snapshot) {
      await ensureDirs();
      await writeJson(SNAPSHOT_PATH, snapshot);
      return { ok: true, path: SNAPSHOT_PATH, creator_count: (snapshot.creators || []).length };
    },

    async executeDecisions(options: ExecuteOptions = {}) {
      const apply = Boolean(options.apply);
      const lock = await this.readLock();
      if (lock) {
        const error = new Error(
          `Refusing to execute: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`,
        );
        (error as { statusCode?: number }).statusCode = 423;
        throw error;
      }
      const snapshot = await readJson(SNAPSHOT_PATH, null);
      if (!snapshot) {
        const error = new Error(`No snapshot at ${SNAPSHOT_PATH}. Nothing to execute.`);
        (error as { statusCode?: number }).statusCode = 404;
        throw error;
      }
      const decisions = (await this.readDecisions()).decisions || {};
      const previousReport = await readJson(EXECUTION_REPORT_PATH, null);
      const alreadyHandedOff = new Set(
        (previousReport?.results || []).filter((item) => item.status === "handed_off").map((item) => item.creator_id),
      );

      const now = new Date().toISOString();
      const results = [];

      for (const creator of snapshot.creators || []) {
        const decision = decisions[creator.creator_id];
        if (!decision || decision.action !== "approve") continue;
        const proposed = creator.proposed_action || "no_action";
        const mapping = OPERATION_BY_ACTION[proposed] || OPERATION_BY_ACTION.no_action;
        if (creator.status === "done" || alreadyHandedOff.has(creator.creator_id)) {
          results.push({
            creator_id: creator.creator_id,
            ref: creator.ref,
            status: "skipped",
            operation: "none",
            reason: "Already handed off or marked done; skipping to stay idempotent.",
            executed_at: now,
          });
          continue;
        }
        if (mapping.operation === "none") {
          results.push({
            creator_id: creator.creator_id,
            ref: creator.ref,
            status: "skipped",
            operation: "none",
            reason: "Approved with no_action; nothing to hand off.",
            executed_at: now,
          });
          continue;
        }
        results.push({
          creator_id: creator.creator_id,
          ref: creator.ref,
          status: apply ? "handed_off" : "dry_run",
          operation: mapping.operation,
          channel: creator.channel || creator.platform || "",
          format: mapping.format,
          draft_id: `draft-${creator.creator_id}`,
          target: creator.handle || creator.name || creator.creator_id,
          draft: decision.draft ?? creator.suggested_reply ?? "",
          comment: decision.comment || "",
          reason: creator.reason || "",
          executed_at: now,
        });
      }

      if (!apply) {
        return { dry_run: true, results, report_path: EXECUTION_REPORT_PATH };
      }

      // Preserve handed_off history so repeated --apply runs stay idempotent:
      // a "skipped" result never replaces the handed_off record it refers to.
      const freshlyHandedOff = new Set(
        results.filter((item) => item.status === "handed_off").map((item) => item.creator_id),
      );
      const carriedForward = (previousReport?.results || []).filter(
        (item) => item.status === "handed_off" && !freshlyHandedOff.has(item.creator_id),
      );
      const carriedIds = new Set(carriedForward.map((item) => item.creator_id));
      const report = {
        executed_at: now,
        dry_run: false,
        source: "kelly-creators",
        results: [
          ...carriedForward,
          ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.creator_id))),
        ],
      };
      await ensureDirs();
      await writeJson(EXECUTION_REPORT_PATH, report);
      return { dry_run: false, results, report, report_path: EXECUTION_REPORT_PATH };
    },
  };

  return provider;
}
