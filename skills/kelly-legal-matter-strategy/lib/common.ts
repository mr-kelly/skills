import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
  envSearchPaths as configuredEnvSearchPaths,
} from "./paths.ts";
import {
  APP_ID,
  APP_SUBTITLE,
  APP_SUBTITLE_ZH,
  APP_TITLE,
  APP_TITLE_ZH,
  type AgentTasksFile,
  type DecisionsFile,
  EXECUTE_OPERATION,
  type ExecutionReport,
  type MetricSet,
  type ReviewItem,
  type ReviewStatus,
  type Snapshot,
} from "./types.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tmp, file);
}

export function emptyMetrics(): MetricSet {
  return { items_total: 0, needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0, checks_failed: 0 };
}

export function emptySnapshot(): Snapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: APP_ID,
    workspace: { title: APP_TITLE, title_zh: APP_TITLE_ZH, subtitle: APP_SUBTITLE, subtitle_zh: APP_SUBTITLE_ZH },
    metrics: emptyMetrics(),
    entities: [],
    items: [],
    checks: [],
    activity_log: [
      {
        at: new Date(0).toISOString(),
        actor: APP_ID,
        action: "init",
        detail: "No snapshot exists yet. Generate a demo snapshot or import a payload.",
        count: 0,
      },
    ],
  };
}

export function emptyDecisions(): DecisionsFile {
  return { schema_version: "1", updated_at: new Date(0).toISOString(), decisions: {} };
}

export function emptyAgentTasks(): AgentTasksFile {
  return { schema_version: "1", updated_at: new Date(0).toISOString(), tasks: [] };
}

export function statusFromDecision(action: string): ReviewStatus | null {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "revise") return "needs_review";
  return null;
}

export function recomputeMetrics(snapshot: Snapshot): Snapshot {
  const metrics = emptyMetrics();
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  metrics.items_total = items.length;
  for (const item of items) {
    const status = item.status || "needs_review";
    if (status in metrics) metrics[status] = Number(metrics[status] || 0) + 1;
  }
  metrics.checks_failed = (snapshot.checks || []).filter((check) => check.status === "fail").length;
  snapshot.metrics = { ...metrics, ...(snapshot.metrics || {}) };
  snapshot.metrics.items_total = metrics.items_total;
  snapshot.metrics.needs_review = metrics.needs_review;
  snapshot.metrics.changes_requested = metrics.changes_requested;
  snapshot.metrics.approved = metrics.approved;
  snapshot.metrics.done = metrics.done;
  snapshot.metrics.blocked = metrics.blocked;
  snapshot.metrics.checks_failed = metrics.checks_failed;
  return snapshot;
}

export async function readSnapshot(): Promise<Snapshot> {
  return recomputeMetrics((await readJson<Snapshot>(SNAPSHOT_PATH, emptySnapshot())) as Snapshot);
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  snapshot.generated_at = snapshot.generated_at || new Date().toISOString();
  await writeJson(SNAPSHOT_PATH, recomputeMetrics(snapshot));
}

export async function readDecisions(): Promise<DecisionsFile> {
  return (await readJson<DecisionsFile>(DECISIONS_PATH, emptyDecisions())) as DecisionsFile;
}

export async function readAgentTasks(): Promise<AgentTasksFile> {
  return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, emptyAgentTasks())) as AgentTasksFile;
}

export async function writeAgentTasks(tasks: AgentTasksFile): Promise<void> {
  await writeJson(AGENT_TASKS_PATH, tasks);
}

export async function readExecutionReport(): Promise<ExecutionReport | null> {
  return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
}

export async function writeExecutionReport(report: ExecutionReport): Promise<void> {
  const existing = await readExecutionReport();
  await writeJson(EXECUTION_REPORT_PATH, mergeExecutionReport(existing, report));
}

function executionResultKey(result: Record<string, unknown>): string {
  if (typeof result.item_id === "string" && result.item_id) return `item:${result.item_id}`;
  if (typeof result.path === "string" && result.path) return `path:${result.path}`;
  return `raw:${JSON.stringify(result)}`;
}

// Scripts (execute_decisions.ts, export_strategy_pack.ts, ...) each produce their own execution
// report; merge their results by a stable key instead of clobbering the shared audit file so one
// script's run can't erase another's record.
function mergeExecutionReport(existing: ExecutionReport | null, incoming: ExecutionReport): ExecutionReport {
  const merged = new Map((existing?.results || []).map((result) => [executionResultKey(result), result]));
  for (const result of incoming.results || []) {
    merged.set(executionResultKey(result), result);
  }
  return { ...(existing || {}), ...incoming, results: [...merged.values()] };
}

export async function readOnboarding(): Promise<Record<string, unknown>> {
  return (await readJson<Record<string, unknown>>(ONBOARDING_PATH, { completed: false })) as Record<string, unknown>;
}

export async function writeOnboarding(marker: Record<string, unknown>): Promise<void> {
  await writeJson(ONBOARDING_PATH, marker);
}

export async function readLock(): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(LOCK_PATH, null);
}

export async function acquireLock(message: string): Promise<Record<string, unknown>> {
  const existing = await readLock();
  if (existing) {
    throw new Error(
      `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "no message"}); refusing to write`,
    );
  }
  const lock = { owner: APP_ID, message, started_at: new Date().toISOString() };
  await writeJson(LOCK_PATH, lock);
  return lock;
}

export async function releaseLock(): Promise<void> {
  await fs.rm(LOCK_PATH, { force: true });
}

export async function enqueueAgentTask(task: Record<string, unknown>): Promise<AgentTasksFile> {
  const tasks = await readAgentTasks();
  const now = new Date().toISOString();
  tasks.tasks.push({
    task_id: `task-${Date.now()}-${tasks.tasks.length + 1}`,
    status: "queued",
    created_at: now,
    ...task,
  });
  tasks.updated_at = now;
  await writeAgentTasks(tasks);
  return tasks;
}

export async function mergePayload(payload: Partial<Snapshot>): Promise<Snapshot> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  if (Array.isArray(payload.entities)) snapshot.entities = upsertById(snapshot.entities || [], payload.entities);
  if (Array.isArray(payload.items)) snapshot.items = upsertById(snapshot.items || [], payload.items as ReviewItem[]);
  if (Array.isArray(payload.checks)) snapshot.checks = upsertById(snapshot.checks || [], payload.checks);
  if (payload.workspace) snapshot.workspace = { ...snapshot.workspace, ...payload.workspace };
  if (Array.isArray(payload.activity_log))
    snapshot.activity_log = [...(snapshot.activity_log || []), ...payload.activity_log];
  snapshot.generated_at = String(payload.generated_at || now);
  snapshot.source = APP_ID;
  snapshot.activity_log = [
    ...(snapshot.activity_log || []),
    {
      at: now,
      actor: APP_ID,
      action: "merge_payload",
      detail: "Merged imported or agent-prepared payload.",
      count: (payload.items || []).length,
    },
  ];
  return recomputeMetrics(snapshot);
}

function upsertById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!item.id) continue;
    map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  }
  return [...map.values()];
}

export async function loadDotenvFiles(paths = configuredEnvSearchPaths()): Promise<void> {
  for (const file of paths) {
    let text = "";
    try {
      text = await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export { configuredEnvSearchPaths as envSearchPaths };
export { EXECUTE_OPERATION };
