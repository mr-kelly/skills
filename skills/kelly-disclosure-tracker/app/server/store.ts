import fs from "node:fs/promises";
import path from "node:path";
import {
  BATCH_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
} from "./paths.ts";
import type {
  Batch,
  Config,
  ConfigResult,
  ConfigSummary,
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

export function emptyBatch(): Batch {
  return {
    batch_id: "",
    generated_at: new Date(0).toISOString(),
    source: "kelly-disclosure-tracker",
    mode: "app-in-skill",
    metrics: {
      vehicles_ready: 0,
      vehicles_blocked: 0,
      vehicles_in_progress: 0,
      items_needs_review: 0,
      items_changes_requested: 0,
      items_done: 0,
      items_blocked: 0,
    },
    vehicles: [],
    items: [],
  };
}

export async function readBatch(): Promise<Batch> {
  return (await readJson<Batch>(BATCH_PATH, emptyBatch())) as Batch;
}

export async function readDecisions(): Promise<DecisionsFile> {
  return (await readJson<DecisionsFile>(DECISIONS_PATH, {})) as DecisionsFile;
}

export async function writeDecisions(decisions: DecisionsFile): Promise<void> {
  await writeJson(DECISIONS_PATH, decisions);
}

export async function readExecutionReport(): Promise<ExecutionReport | null> {
  return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
}

export async function readLock(): Promise<unknown> {
  return readJson(LOCK_PATH, null);
}

export async function acquireLock(owner: string, message: string): Promise<void> {
  await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
}

export async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// Recompute a batch's derived status/metrics from decisions. Applying a decision
// moves an item to its terminal review state: verified -> done, needs_source ->
// changes_requested (waiting on a source document), flagged -> blocked (a real
// cross-entity inconsistency the reviewer must escalate). Undecided items with a
// reconciliation mismatch default to needs_review so they surface immediately.
export function applyDecisions(batch: Batch, decisions: DecisionsFile): Batch {
  const items = batch.items.map((item) => {
    const decision = decisions[item.id];
    if (!decision)
      return {
        ...item,
        decision: undefined,
        status:
          item.status === "done" || item.status === "blocked" || item.status === "changes_requested"
            ? "needs_review"
            : item.status,
      };
    const status =
      decision.action === "verified" ? "done" : decision.action === "needs_source" ? "changes_requested" : "blocked";
    return { ...item, decision, status } as typeof item;
  });

  const metrics = {
    vehicles_ready: 0,
    vehicles_blocked: 0,
    vehicles_in_progress: 0,
    items_needs_review: items.filter((i) => i.status === "needs_review").length,
    items_changes_requested: items.filter((i) => i.status === "changes_requested").length,
    items_done: items.filter((i) => i.status === "done").length,
    items_blocked: items.filter((i) => i.status === "blocked").length,
  };

  const vehicles = batch.vehicles.map((vehicle) => {
    const vItems = items.filter((i) => i.vehicle_id === vehicle.vehicle_id);
    const vMetrics = {
      total: vItems.length,
      needs_review: vItems.filter((i) => i.status === "needs_review").length,
      changes_requested: vItems.filter((i) => i.status === "changes_requested").length,
      done: vItems.filter((i) => i.status === "done").length,
      blocked: vItems.filter((i) => i.status === "blocked").length,
    };
    const readiness =
      vMetrics.blocked > 0
        ? "blocked"
        : vMetrics.done === vMetrics.total && vMetrics.total > 0
          ? "ready"
          : "in_progress";
    if (readiness === "ready") metrics.vehicles_ready += 1;
    else if (readiness === "blocked") metrics.vehicles_blocked += 1;
    else metrics.vehicles_in_progress += 1;
    return { ...vehicle, metrics: vMetrics, readiness } as typeof vehicle;
  });

  return { ...batch, items, vehicles, metrics };
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_DISCLOSURE_TRACKER_CONFIG) paths.push(process.env.KELLY_DISCLOSURE_TRACKER_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-disclosure-tracker", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_DISCLOSURE_TRACKER_ENV_FILE) paths.push(process.env.KELLY_DISCLOSURE_TRACKER_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-disclosure-tracker", ".env"));
  return paths;
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

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    reviewer_name: String(config.reviewer_name || "Unassigned reviewer"),
    data_provider: String(config.data_provider || "local"),
  };
}

export async function recordDecision(itemId: string, decision: Decision): Promise<Batch> {
  const decisions = await readDecisions();
  decisions[itemId] = decision;
  await writeDecisions(decisions);
  const batch = await readBatch();
  return applyDecisions(batch, decisions);
}
