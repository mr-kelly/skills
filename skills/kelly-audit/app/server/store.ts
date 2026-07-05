import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "./paths.ts";
import type {
  AgentTasksFile,
  Anomaly,
  AuditSnapshot,
  Config,
  ConfigResult,
  Decision,
  DecisionsFile,
  ExecutionReport,
  Onboarding,
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
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readSnapshot(): Promise<AuditSnapshot> {
  return (await readJson<AuditSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as AuditSnapshot;
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<unknown> {
  return readJson(LOCK_PATH, null);
}

export async function readDecisions(): Promise<DecisionsFile> {
  return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
}

export async function readAgentTasks(): Promise<AgentTasksFile> {
  return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
}

export async function readExecutionReport(): Promise<ExecutionReport | null> {
  return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
}

export function emptySnapshot(): AuditSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-audit",
    base_currency: "USD",
    fx_rates: {},
    company: { name: "" },
    range: { start: "", end: "" },
    metrics: {
      order_count: 0,
      invoice_count: 0,
      payment_count: 0,
      matched_payment_count: 0,
      matched_pct: 0,
      anomaly_count: 0,
      open_anomaly_count: 0,
      at_stake_total: 0,
      receivable_total: 0,
      overdue_receivable_total: 0,
      aging: [],
    },
    orders: [],
    invoices: [],
    payments: [],
    matches: [],
    anomalies: [],
    import_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No audit snapshot exists yet. Import orders/invoices/payments, then run the checks.",
      },
    ],
  };
}

// Overlay user decisions and the latest execution report onto the anomaly
// batch so the UI and the executor see the same workflow states.
export function mergeAnomalies(
  snapshot: AuditSnapshot,
  decisions: DecisionsFile | null,
  executionReport: ExecutionReport | null,
): AuditSnapshot {
  const verdicts = decisions?.decisions || {};
  const execById = new Map<string, ExecutionReport["results"][number]>();
  for (const result of executionReport?.results || []) {
    if (result?.id) execById.set(result.id, result);
  }
  const anomalies = (snapshot.anomalies || []).map((anomaly) => {
    const decision = verdicts[anomaly.id] || anomaly.decision || null;
    const reportEntry = execById.get(anomaly.id);
    const execution =
      anomaly.execution ||
      (reportEntry
        ? {
            status: reportEntry.status,
            operation: reportEntry.operation,
            target: reportEntry.target || "",
            detail: reportEntry.detail || "",
            executed_at: executionReport?.generated_at || "",
          }
        : null);
    let status = anomaly.status;
    if (decision?.action === "approve") status = "approved";
    if (decision?.action === "request_changes") status = "changes_requested";
    if (decision?.action === "block") status = "blocked";
    if (decision?.action === "dismiss") status = "done";
    if (execution?.status === "executed") status = "done";
    return {
      ...anomaly,
      status,
      decision,
      draft: decision?.draft ?? anomaly.draft,
      execution,
    };
  });
  return { ...snapshot, anomalies };
}

const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block", "dismiss"]);

interface ApplyDecisionInput {
  id: string;
  action: string;
  note?: string;
  draft?: string;
}

interface ApplyDecisionResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function applyDecision({ id, action, note, draft }: ApplyDecisionInput): Promise<ApplyDecisionResult> {
  if (!DECISION_ACTIONS.has(action)) {
    return { ok: false, status: 400, error: `Unknown action: ${action}` };
  }
  const snapshot = await readSnapshot();
  const anomaly = (snapshot.anomalies || []).find((item) => item.id === id);
  if (!anomaly) {
    return { ok: false, status: 404, error: `Unknown anomaly id: ${id}` };
  }
  const now = new Date().toISOString();
  const decisions = await readDecisions();
  decisions.decisions[id] = {
    action,
    note: String(note || ""),
    draft: typeof draft === "string" ? draft : null,
    decided_at: now,
  };
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);

  const tasks = await readAgentTasks();
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

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AUDIT_CONFIG) paths.push(process.env.KELLY_AUDIT_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-audit", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_AUDIT_ENV_FILE) paths.push(process.env.KELLY_AUDIT_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-audit", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

function summarizeColumns(table: unknown) {
  if (!table || typeof table !== "object") return { format: "csv", columns: {} };
  const t = table as { format?: string; columns?: unknown };
  return {
    format: t.format || "csv",
    columns: t.columns && typeof t.columns === "object" ? t.columns : {},
  };
}

export function summarizeConfig(configResult: ConfigResult) {
  const config = configResult.config || {};
  const rules = { ...(config.rules || {}) };
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    company: {
      name: config.company?.name || "",
      contact_email: config.company?.contact_email || "",
    },
    base_currency: config.base_currency || "USD",
    rules: {
      days_to_invoice: rules.days_to_invoice ?? 14,
      amount_tolerance_pct: rules.amount_tolerance_pct ?? 1,
      aging_buckets: Array.isArray(rules.aging_buckets) ? rules.aging_buckets : [30, 60, 90],
      duplicate_window_days: rules.duplicate_window_days ?? 7,
    },
    import: {
      orders: summarizeColumns(config.import?.orders),
      invoices: summarizeColumns(config.import?.invoices),
      payments: summarizeColumns(config.import?.payments),
    },
    env: {
      config_env: "KELLY_AUDIT_CONFIG",
      config_env_set: Boolean(process.env.KELLY_AUDIT_CONFIG),
      env_file_env: "KELLY_AUDIT_ENV_FILE",
      env_file_set: Boolean(process.env.KELLY_AUDIT_ENV_FILE),
    },
  };
}
