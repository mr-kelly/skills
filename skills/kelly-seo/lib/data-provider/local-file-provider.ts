// Local-file SeoDataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON files (seo_snapshot.json, decisions.json,
// agent_tasks.json, execution_report.json, onboarding.json, agent.lock). This is
// the offline reference implementation of the same review model Busabase serves
// remotely, so KELLY_SEO_DATA_PROVIDER=local|busabase is a config switch, not a
// rewrite of the UI or scripts. Every file path and JSON shape here is
// byte-identical to the former app/server/store.ts, so /api/state is unchanged.

import fs from "node:fs/promises";
import {
  emptySnapshot,
  ensureDirs,
  mergeGeoOpportunities,
  mergeOpportunities,
  readJson,
  summarizeConfig,
  writeJson,
} from "../common.ts";
import {
  AGENT_TASKS_PATH,
  DECISIONS_PATH,
  ENTITY_SIGNALS_PATH,
  EXECUTION_REPORT_PATH,
  GEO_DECISIONS_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type { ProviderMeta, SeoSnapshot } from "../types.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
const ENTITY_SIGNAL_STATUSES = new Set(["present", "partial", "missing"]);
const ENTITY_SIGNAL_WEIGHT = { present: 1, partial: 0.5, missing: 0 };

// Fold persisted per-signal overrides (entity_signals.json) back onto the
// snapshot's entity_signals and recompute the readiness score.
function applyEntityOverrides(snapshot, overrides) {
  const readiness = snapshot.entity_signals;
  if (!readiness || !Array.isArray(readiness.signals)) return snapshot;
  const map = overrides?.signals || {};
  const signals = readiness.signals.map((signal) => {
    const override = map[signal.id];
    if (!override) return signal;
    return {
      ...signal,
      status: override.status || signal.status,
      detail: override.note ? String(override.note) : signal.detail,
    };
  });
  const total = signals.reduce((sum, signal) => sum + (ENTITY_SIGNAL_WEIGHT[signal.status] ?? 0), 0);
  const score = signals.length ? Math.round((total / signals.length) * 100) : readiness.score;
  return { ...snapshot, entity_signals: { ...readiness, signals, score } };
}

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

    async getGeoDecisions() {
      return readJson(GEO_DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async getEntitySignalOverrides() {
      return readJson(ENTITY_SIGNALS_PATH, { updated_at: "", signals: {} });
    },

    async configSummary() {
      return summarizeConfig(meta);
    },

    async getState() {
      const [snapshot, onboarding, lock, decisions, agentTasks, executionReport, geoDecisions, entityOverrides] =
        await Promise.all([
          this.getSnapshot(),
          this.getOnboarding(),
          this.getLock(),
          this.getDecisions(),
          this.getAgentTasks(),
          this.getExecutionReport(),
          this.getGeoDecisions(),
          this.getEntitySignalOverrides(),
        ]);
      const withSeo = mergeOpportunities(snapshot, decisions, executionReport);
      const withGeo = mergeGeoOpportunities(withSeo, geoDecisions);
      return {
        onboarding,
        lock,
        config_summary: summarizeConfig(meta),
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot: applyEntityOverrides(withGeo, entityOverrides),
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

    async saveGeoDecision({ id, action, note, draft }) {
      if (!DECISION_ACTIONS.has(action)) {
        return { ok: false, status: 400, error: `Unknown action: ${action}` };
      }
      const snapshot = await this.getSnapshot();
      const opportunity = (snapshot.geo_opportunities || []).find((item) => item.id === id);
      if (!opportunity) {
        return { ok: false, status: 404, error: `Unknown GEO opportunity id: ${id}` };
      }
      // geo-qa is a hard gate: a BLOCKed change cannot be approved.
      if (action === "approve" && opportunity.gate?.verdict === "BLOCK") {
        return {
          ok: false,
          status: 422,
          error: "geo-qa BLOCK: resolve the failing checks before approving this GEO change.",
        };
      }
      const now = new Date().toISOString();
      const geoDecisions = await this.getGeoDecisions();
      geoDecisions.decisions[id] = {
        action,
        note: String(note || ""),
        draft: typeof draft === "string" ? draft : null,
        decided_at: now,
      };
      geoDecisions.updated_at = now;
      await writeJson(GEO_DECISIONS_PATH, geoDecisions);
      return { ok: true };
    },

    async updateEntitySignal({ id, status, note }) {
      if (!ENTITY_SIGNAL_STATUSES.has(status)) {
        return { ok: false, status: 400, error: `Unknown entity-signal status: ${status}` };
      }
      const snapshot = await this.getSnapshot();
      const signal = (snapshot.entity_signals?.signals || []).find((item) => item.id === id);
      if (!signal) {
        return { ok: false, status: 404, error: `Unknown entity signal id: ${id}` };
      }
      const now = new Date().toISOString();
      const overrides = await this.getEntitySignalOverrides();
      overrides.signals[id] = { status, note: String(note || ""), updated_at: now };
      overrides.updated_at = now;
      await writeJson(ENTITY_SIGNALS_PATH, overrides);
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
