import fs from "node:fs/promises";
import {
  agentTasksPath,
  configExamplePath,
  configLocalPath,
  dataDir,
  decisionsPath,
  executionReportPath,
  lockPath,
  onboardingPath,
  snapshotPath,
} from "../paths.ts";
import type { AgentTasksFile, DecisionsFile, FinanceSnapshot, LockRecord, Onboarding } from "../types.ts";
import type { DataProvider, ReviewInput } from "./provider-interface.ts";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function recalc(snapshot: FinanceSnapshot): FinanceSnapshot {
  const checks = snapshot.checks || [];
  return {
    ...snapshot,
    metrics: {
      ...snapshot.metrics,
      needs_review: checks.filter((item) => item.status === "needs_review" || item.status === "changes_requested")
        .length,
      approved: checks.filter((item) => item.status === "approved").length,
      done: checks.filter((item) => item.status === "done").length,
      blocked: checks.filter((item) => item.status === "blocked").length,
    },
  };
}

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async ensureReady(): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
  }

  async readSnapshot(): Promise<FinanceSnapshot> {
    return readJson<FinanceSnapshot>(snapshotPath, {
      snapshot_id: "empty",
      generated_at: new Date().toISOString(),
      source: "local",
      company: "Unconfigured model",
      currency: "USD",
      display_unit: "units",
      model_purpose: "Setup required",
      periods: [],
      metrics: {
        needs_review: 0,
        approved: 0,
        done: 0,
        blocked: 0,
        revenue_cagr: 0,
        ending_cash: 0,
        free_cash_flow: 0,
        balance_check: 0,
      },
      checks: [],
      warnings: ["No local model snapshot exists yet. Generate a demo snapshot or build a model first."],
      workbook: { tabs: [] },
    });
  }

  async writeSnapshot(snapshot: FinanceSnapshot): Promise<void> {
    await writeJson(snapshotPath, recalc(snapshot));
  }

  async readDecisions(): Promise<DecisionsFile> {
    return readJson<DecisionsFile>(decisionsPath, { decisions: {} });
  }

  async readAgentTasks(): Promise<AgentTasksFile> {
    return readJson<AgentTasksFile>(agentTasksPath, { tasks: [] });
  }

  async readExecutionReport(): Promise<Record<string, unknown> | null> {
    return readJson<Record<string, unknown> | null>(executionReportPath, null);
  }

  async readOnboarding(): Promise<Onboarding> {
    return readJson<Onboarding>(onboardingPath, { completed: false });
  }

  async readLock(): Promise<LockRecord | null> {
    return readJson<LockRecord | null>(lockPath, null);
  }

  async applyDecision(input: ReviewInput): Promise<FinanceSnapshot> {
    const lock = await this.readLock();
    if (lock) throw new Error("Kelly Finance is locked by the agent. Try again after the write completes.");
    const snapshot = await this.readSnapshot();
    const id = input.id || "";
    const now = new Date().toISOString();
    const decision = { action: input.action || "revise", comment: input.comment || "", decided_at: now };
    const checks = snapshot.checks.map((item) => {
      if (item.id !== id) return item;
      const status =
        input.action === "approve"
          ? "approved"
          : input.action === "request_changes"
            ? "changes_requested"
            : input.action === "block"
              ? "blocked"
              : input.action === "dismiss"
                ? "done"
                : item.status;
      return { ...item, status, draft: input.draft ?? item.draft, decision };
    });
    const next = recalc({ ...snapshot, checks });
    await this.writeSnapshot(next);
    const decisions = await this.readDecisions();
    decisions.decisions[id] = decision;
    await writeJson(decisionsPath, decisions);
    const tasks: AgentTasksFile = {
      tasks: checks
        .filter((item) => item.status === "changes_requested")
        .map((item) => ({ id: item.id, note: item.decision?.comment || "Revise this model check.", created_at: now })),
    };
    await writeJson(agentTasksPath, tasks);
    return next;
  }

  async completeOnboarding(marker?: Onboarding): Promise<Onboarding> {
    const done = marker || { completed: true, completed_at: new Date().toISOString(), config_version: "1" };
    await writeJson(onboardingPath, done);
    return done;
  }

  async acquireLock(lock: LockRecord): Promise<void> {
    const existing = await this.readLock();
    if (existing) throw new Error(`Lock already held: ${existing.message}`);
    await writeJson(lockPath, lock);
  }

  async releaseLock(): Promise<void> {
    try {
      await fs.unlink(lockPath);
    } catch {}
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    const localExists = await fs
      .access(configLocalPath)
      .then(() => true)
      .catch(() => false);
    const config = await readJson<Record<string, unknown>>(localExists ? configLocalPath : configExamplePath, {});
    return {
      provider: this.name,
      config_source: localExists ? "config.local.json" : "config.example.json",
      company: config.company || null,
      model_defaults: config.model_defaults || null,
      secrets_required: false,
    };
  }
}

export const localFileProvider = new LocalFileProvider();
