// Provider-agnostic audit helpers shared by the data providers, the Hono server,
// and the scripts: JSON read/write primitives, the empty-snapshot seed, the
// decision/execution overlay (mergeAnomalies), and config/env loading. None of
// this touches a specific backend — the providers layer storage on top of it.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { AuditSnapshot, Config, ConfigResult, DecisionsFile, ExecutionReport } from "./types.ts";

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

// Same open/at-stake status sets deriveSnapshot() uses (app/server/compute.ts),
// duplicated here so the transient decision overlay below can recompute the
// two KPIs that depend on anomaly status without lib/ importing app/server/.
const OPEN_ANOMALY_STATUSES = new Set(["needs_review", "changes_requested"]);
const AT_STAKE_STATUSES = new Set(["needs_review", "changes_requested", "approved"]);

function toBaseAmount(amount: unknown, currency: string | undefined, snapshot: AuditSnapshot): number {
  const base = snapshot.base_currency || "USD";
  if (!currency || currency === base) return Number(amount || 0);
  const rate = Number(snapshot.fx_rates?.[currency] || 0);
  return rate ? Number(amount || 0) * rate : Number(amount || 0);
}

// Overlay user decisions and the latest execution report onto the anomaly batch
// so the UI and the executor see the same workflow states. Also recomputes the
// status-derived KPI metrics (open_anomaly_count, at_stake_total) so they stay
// in sync with approvals/dismissals instead of only reflecting the raw
// persisted anomaly.status from the last import/checks run.
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
  const metrics = {
    ...snapshot.metrics,
    open_anomaly_count: anomalies.filter((anomaly) => OPEN_ANOMALY_STATUSES.has(anomaly.status)).length,
    at_stake_total: Number(
      anomalies
        .filter((anomaly) => AT_STAKE_STATUSES.has(anomaly.status))
        .reduce((sum, anomaly) => sum + toBaseAmount(anomaly.amount_at_stake, anomaly.currency, snapshot), 0)
        .toFixed(2),
    ),
  };
  return { ...snapshot, anomalies, metrics };
}

// ---- Config / env loading ----

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
