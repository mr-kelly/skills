import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "./paths.ts";
import type {
  Config,
  ConfigResult,
  ConfigSummary,
  Decision,
  DecisionsFile,
  DevopsSnapshot,
  Lock,
  Onboarding,
  OpsAction,
  OpsEvent,
  Thresholds,
} from "./types.ts";

interface AgentTask {
  task_id: string;
  action_id: string;
  type: string;
  title: string;
  request: string;
  status: string;
  created_at: string;
}

interface AgentTasksFile {
  tasks: AgentTask[];
  updated_at?: string;
}

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

export async function readSnapshot(): Promise<DevopsSnapshot> {
  return (await readJson<DevopsSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as DevopsSnapshot;
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<Lock | null> {
  return readJson<Lock>(LOCK_PATH, null);
}

export async function readDecisions(): Promise<DecisionsFile> {
  return (await readJson<DecisionsFile>(DECISIONS_PATH, { decisions: {} })) as DecisionsFile;
}

export function emptySnapshot(): DevopsSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-devops",
    currency: "USD",
    checks: {
      services_checked_at: "",
      domains_checked_at: "",
      spend_ingested_at: "",
    },
    metrics: {
      services_total: 0,
      services_up: 0,
      services_degraded: 0,
      services_down: 0,
      certs_ok: 0,
      certs_expiring: 0,
      domains_ok: 0,
      domains_expiring: 0,
      expiring_14d: 0,
      actions_needing_review: 0,
      spend_mtd: 0,
      spend_last_month: 0,
      spend_anomalies: 0,
    },
    services: [],
    expiries: [],
    spend: { currency: "USD", providers: [], products: [] },
    actions: [],
    events: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No ops snapshot exists yet. Configure services and domains, then run the checks.",
      },
    ],
  };
}

export async function loadDotenvFiles(files) {
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
  if (process.env.KELLY_DEVOPS_CONFIG) paths.push(process.env.KELLY_DEVOPS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-devops", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_DEVOPS_ENV_FILE) paths.push(process.env.KELLY_DEVOPS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-devops", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const products = Array.isArray(config.products) ? config.products : [];
  const services = Array.isArray(config.services) ? config.services : [];
  const domains = Array.isArray(config.domains) ? config.domains : [];
  const keyRotation = Array.isArray(config.key_rotation) ? config.key_rotation : [];
  const billingSources = Array.isArray(config.billing_sources) ? config.billing_sources : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    thresholds: config.thresholds || {},
    products: products.map((product) => ({
      product_id: product.product_id || "",
      name: product.name || product.product_id || "",
    })),
    services: services.map((service) => ({
      service_id: service.service_id || "",
      name: service.name || service.service_id || "",
      product: service.product || "",
      url: service.url || "",
    })),
    domains: domains.map((domain) => ({
      domain: domain.domain || "",
      product: domain.product || "",
      registrar: domain.registrar || "",
      auto_renew: Boolean(domain.auto_renew),
    })),
    key_rotation: keyRotation.map((key) => ({
      key_id: key.key_id || "",
      name: key.name || key.key_id || "",
      env: key.env || "",
      rotate_every_days: Number(key.rotate_every_days || 0),
      env_ready: Boolean(key.env && process.env[key.env]),
    })),
    billing_sources: billingSources.map((source) => {
      const secretKeys = ["api_key_env", "token_env", "client_secret_env"].filter((key) => source[key]);
      const secretEnvs = secretKeys.map((key) => String(source[key]));
      return {
        provider_id: source.provider_id || "",
        name: source.name || source.provider_id || "",
        secret_envs: secretEnvs,
        secrets_ready: secretEnvs.every((name) => Boolean(process.env[name])),
      };
    }),
  };
}

export async function acquireLock(owner: string, message: string): Promise<void> {
  const existing = await readLock();
  if (existing && existing.owner !== owner) {
    const error = new Error(
      `Agent lock is held by ${existing.owner || "unknown"}: ${existing.message || "working"}`,
    ) as NodeJS.ErrnoException;
    error.code = "LOCKED";
    throw error;
  }
  await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
}

export async function releaseLock(): Promise<void> {
  await fs.rm(LOCK_PATH, { force: true });
}

export function recomputeMetrics(snapshot: DevopsSnapshot, thresholds: Thresholds = {}): DevopsSnapshot {
  const warningDays = Number(thresholds.expiry_warning_days || 30);
  const services = Array.isArray(snapshot.services) ? snapshot.services : [];
  const expiries = Array.isArray(snapshot.expiries) ? snapshot.expiries : [];
  const actions = Array.isArray(snapshot.actions) ? snapshot.actions : [];
  const providers = Array.isArray(snapshot.spend?.providers) ? snapshot.spend.providers : [];
  const domains = expiries.filter((item) => item.type === "domain");
  const withCert = services.filter((service) => service.ssl && Number.isFinite(Number(service.ssl.days_left)));
  const certsExpiring = withCert.filter((service) => Number(service.ssl.days_left) <= warningDays).length;
  snapshot.metrics = {
    services_total: services.length,
    services_up: services.filter((service) => service.status === "up").length,
    services_degraded: services.filter((service) => service.status === "degraded").length,
    services_down: services.filter((service) => service.status === "down").length,
    certs_ok: withCert.length - certsExpiring,
    certs_expiring: certsExpiring,
    domains_ok: domains.filter((item) => Number(item.days_left) > warningDays).length,
    domains_expiring: domains.filter((item) => Number(item.days_left) <= warningDays).length,
    expiring_14d: expiries.filter((item) => Number(item.days_left) <= 14).length,
    actions_needing_review: actions.filter((action) => action.status === "needs_review").length,
    spend_mtd: round2(providers.reduce((sum, row) => sum + Number(row.mtd || 0), 0)),
    spend_last_month: round2(providers.reduce((sum, row) => sum + Number(row.last_month || 0), 0)),
    spend_anomalies: providers.filter((row) => row.anomaly).length,
  };
  return snapshot;
}

export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function pushEvent(snapshot: DevopsSnapshot, event: OpsEvent): void {
  snapshot.events = Array.isArray(snapshot.events) ? snapshot.events : [];
  snapshot.events = snapshot.events.filter((item) => item.event_id !== event.event_id);
  snapshot.events.unshift(event);
  snapshot.events = snapshot.events.slice(0, 50);
}

const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

const VERDICT_STATUS: Record<string, string> = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

export async function applyDecision({
  action_id,
  verdict,
  note,
}: {
  action_id?: string;
  verdict?: string;
  note?: string;
}): Promise<{ action: OpsAction; decision: Decision }> {
  if (!action_id || typeof action_id !== "string") throw new Error("action_id is required");
  if (!verdict || !VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
  const lock = await readLock();
  if (lock) {
    const error = new Error(
      `Agent lock is held by ${lock.owner || "unknown"}: ${lock.message || "working"}`,
    ) as NodeJS.ErrnoException;
    error.code = "LOCKED";
    throw error;
  }
  const snapshot = await readSnapshot();
  const action = (snapshot.actions || []).find((item) => item.action_id === action_id);
  if (!action) throw new Error(`Unknown action: ${action_id}`);
  const decidedAt = new Date().toISOString();
  const decision = {
    action_id,
    verdict,
    note: typeof note === "string" ? note : "",
    decided_at: decidedAt,
  };
  if (verdict !== "note") action.status = VERDICT_STATUS[verdict];
  action.decision = decision;
  if (typeof note === "string") action.note = note;

  const decisions = await readDecisions();
  decisions.decisions = decisions.decisions || {};
  decisions.decisions[action_id] = decision;
  decisions.updated_at = decidedAt;

  snapshot.metrics.actions_needing_review = (snapshot.actions || []).filter(
    (item) => item.status === "needs_review",
  ).length;

  await writeJson(DECISIONS_PATH, decisions);
  await writeJson(SNAPSHOT_PATH, snapshot);

  if (verdict === "request_changes") {
    const tasks: AgentTasksFile = (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { tasks: [] })) || { tasks: [] };
    tasks.tasks = Array.isArray(tasks.tasks) ? tasks.tasks.filter((task) => task.action_id !== action_id) : [];
    tasks.tasks.push({
      task_id: `task-${action_id}-${Date.now()}`,
      action_id,
      type: action.type || "",
      title: action.title || "",
      request: decision.note,
      status: "queued",
      created_at: decidedAt,
    });
    tasks.updated_at = decidedAt;
    await writeJson(AGENT_TASKS_PATH, tasks);
  }

  return { action, decision };
}
