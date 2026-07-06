// Local-file DataProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files — byte-for-byte the same files
// and shapes the original app/server/store.ts read and wrote. This is the offline
// reference implementation of the same review model Busabase serves remotely, so
// KELLY_AUDIT_DATA_PROVIDER=local|busabase is a config switch, not a rewrite of
// the UI, the /api/state payload, or the import/checks/execute scripts.

import fs from "node:fs/promises";
import { emptySnapshot, readJson, writeJson } from "../audit-core.ts";
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
  AgentTasksFile,
  ApplyDecisionInput,
  ApplyDecisionResult,
  AuditSnapshot,
  DecisionsFile,
  ExecutionReport,
  LockRecord,
  Onboarding,
  ProviderMeta,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block", "dismiss"]);

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async readSnapshot(): Promise<AuditSnapshot> {
    return (await readJson<AuditSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as AuditSnapshot;
  }

  async readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async readLock(): Promise<LockRecord | null> {
    return readJson<LockRecord>(LOCK_PATH, null);
  }

  async readDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
  }

  async readAgentTasks(): Promise<AgentTasksFile> {
    return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
  }

  async readExecutionReport(): Promise<ExecutionReport | null> {
    return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  async applyDecision({ id, action, note, draft }: ApplyDecisionInput): Promise<ApplyDecisionResult> {
    if (!DECISION_ACTIONS.has(action)) {
      return { ok: false, status: 400, error: `Unknown action: ${action}` };
    }
    const snapshot = await this.readSnapshot();
    const anomaly = (snapshot.anomalies || []).find((item) => item.id === id);
    if (!anomaly) {
      return { ok: false, status: 404, error: `Unknown anomaly id: ${id}` };
    }
    const now = new Date().toISOString();
    const decisions = await this.readDecisions();
    decisions.decisions[id] = {
      action,
      note: String(note || ""),
      draft: typeof draft === "string" ? draft : null,
      decided_at: now,
    };
    decisions.updated_at = now;
    await writeJson(DECISIONS_PATH, decisions);

    const tasks = await this.readAgentTasks();
    tasks.tasks = (tasks.tasks || []).filter((task) => task.id !== id);
    if (action === "request_changes") {
      tasks.tasks.push({
        id,
        ref: anomaly.ref,
        title: anomaly.title,
        rule: anomaly.rule,
        type: "revise_anomaly",
        note: String(note || ""),
        requested_at: now,
      });
    }
    tasks.updated_at = now;
    await writeJson(AGENT_TASKS_PATH, tasks);
    return { ok: true };
  }

  async writeSnapshot(snapshot: AuditSnapshot): Promise<void> {
    await writeJson(SNAPSHOT_PATH, snapshot);
  }

  async writeExecutionReport(report: ExecutionReport): Promise<void> {
    await writeJson(EXECUTION_REPORT_PATH, report);
  }

  async acquireLock(record: LockRecord): Promise<void> {
    await writeJson(LOCK_PATH, record);
  }

  async releaseLock(): Promise<void> {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

export function createLocalFileProvider(_meta: ProviderMeta = {}): DataProvider {
  return new LocalFileProvider();
}
