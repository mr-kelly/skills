// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files (ads_snapshot.json,
// decisions.json, agent_tasks.json, onboarding.json) plus the agent.lock file.
// This provider is the offline reference implementation of the same
// review-before-execute model Busabase serves remotely, so
// KELLY_ADS_DATA_PROVIDER=local|busabase is a config switch, not a rewrite of the
// UI or the ingest / checks / execute scripts.

import fs from "node:fs/promises";
import {
  emptySnapshot,
  ensureDirs,
  readConfig,
  readJson,
  summarizeConfig,
  writeJson,
} from "../common.ts";
import { agentTasksPath, decisionsPath, lockPath, onboardingPath, snapshotPath } from "../paths.ts";
import type {
  Adjustment,
  AdjustmentDecision,
  AdsSnapshot,
  ConfigResult,
  DecisionInput,
  DecisionsFile,
  Lock,
  Onboarding,
  ProviderMeta,
} from "../types.ts";
import type { AdsState, DataProvider } from "./provider-interface.ts";

const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

const VERDICT_STATUS: Record<string, string> = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

export function createLocalFileProvider(meta: ProviderMeta = {}): DataProvider {
  const provider: DataProvider = {
    name: "local",

    async ensureDirs(): Promise<void> {
      await ensureDirs();
    },

    async readSnapshot(): Promise<AdsSnapshot> {
      return (await readJson<AdsSnapshot>(snapshotPath, emptySnapshot())) as AdsSnapshot;
    },

    async writeSnapshot(snapshot: AdsSnapshot): Promise<void> {
      await writeJson(snapshotPath, snapshot);
    },

    async readOnboarding(): Promise<Onboarding> {
      return (await readJson<Onboarding>(onboardingPath, { completed: false })) as Onboarding;
    },

    async readLock(): Promise<Lock | null> {
      return readJson<Lock>(lockPath, null);
    },

    async readDecisions(): Promise<DecisionsFile> {
      return (await readJson<DecisionsFile>(decisionsPath, { decisions: {} })) as DecisionsFile;
    },

    async readConfig(): Promise<ConfigResult> {
      // Prefer the config already loaded by createProvider() when present; fall
      // back to a fresh read so scripts that construct the provider still work.
      if (meta.config && meta.source !== undefined) {
        return { config: meta.config, path: meta.source || "", is_example: Boolean(meta.is_example) };
      }
      return readConfig();
    },

    summarizeConfig(configResult: ConfigResult) {
      return summarizeConfig(configResult);
    },

    async acquireLock(owner: string, message: string): Promise<void> {
      const existing = await provider.readLock();
      if (existing && existing.owner !== owner) {
        const error = new Error(
          `Agent lock is held by ${existing.owner || "unknown"}: ${existing.message || "working"}`,
        ) as NodeJS.ErrnoException;
        error.code = "LOCKED";
        throw error;
      }
      await writeJson(lockPath, { owner, message, started_at: new Date().toISOString() });
    },

    async releaseLock(): Promise<void> {
      await fs.rm(lockPath, { force: true });
    },

    async getState(): Promise<AdsState> {
      const [snapshot, onboarding, lock, configResult] = await Promise.all([
        provider.readSnapshot(),
        provider.readOnboarding(),
        provider.readLock(),
        provider.readConfig(),
      ]);
      return {
        app: "kelly-ads",
        data_provider: this.name,
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async applyDecision({
      adjustment_id,
      verdict,
      note,
    }: DecisionInput): Promise<{ adjustment: Adjustment; decision: AdjustmentDecision }> {
      if (!adjustment_id || typeof adjustment_id !== "string") throw new Error("adjustment_id is required");
      if (!verdict || !VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
      const lock = await provider.readLock();
      if (lock) {
        const error = new Error(
          `Agent lock is held by ${lock.owner || "unknown"}: ${lock.message || "working"}`,
        ) as NodeJS.ErrnoException;
        error.code = "LOCKED";
        throw error;
      }
      const snapshot = await provider.readSnapshot();
      const adjustment = (snapshot.adjustments || []).find((item) => item.adjustment_id === adjustment_id);
      if (!adjustment) throw new Error(`Unknown adjustment: ${adjustment_id}`);
      const decidedAt = new Date().toISOString();
      const decision: AdjustmentDecision = {
        adjustment_id,
        verdict: verdict as AdjustmentDecision["verdict"],
        note: typeof note === "string" ? note : "",
        decided_at: decidedAt,
      };
      if (verdict !== "note") adjustment.status = VERDICT_STATUS[verdict];
      adjustment.decision = decision;
      if (typeof note === "string") adjustment.note = note;

      const decisions = await provider.readDecisions();
      decisions.decisions = decisions.decisions || {};
      decisions.decisions[adjustment_id] = decision;
      decisions.updated_at = decidedAt;

      snapshot.metrics = snapshot.metrics || emptySnapshot().metrics;
      snapshot.metrics.adjustments_needing_review = (snapshot.adjustments || []).filter(
        (item) => item.status === "needs_review",
      ).length;

      await writeJson(decisionsPath, decisions);
      await writeJson(snapshotPath, snapshot);

      if (verdict === "request_changes") {
        const tasks = (await readJson<{ tasks: Record<string, unknown>[]; updated_at?: string }>(agentTasksPath, {
          tasks: [],
        })) || { tasks: [] };
        tasks.tasks = Array.isArray(tasks.tasks)
          ? tasks.tasks.filter((task) => task.adjustment_id !== adjustment_id)
          : [];
        tasks.tasks.push({
          task_id: `task-${adjustment_id}-${Date.now()}`,
          adjustment_id,
          type: adjustment.type || "",
          title: adjustment.title || "",
          request: decision.note,
          status: "queued",
          created_at: decidedAt,
        });
        tasks.updated_at = decidedAt;
        await writeJson(agentTasksPath, tasks);
      }

      return { adjustment, decision };
    },
  };

  return provider;
}
