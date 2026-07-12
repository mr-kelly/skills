import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(appDir, ".data");
const decisionsPath = path.join(dataDir, "decisions.json");
const lockPath = path.join(dataDir, "agent.lock");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readLock(): Promise<Record<string, unknown> | null> {
  return readJson(lockPath, null);
}

export async function readDecisions(): Promise<Record<string, unknown>> {
  return readJson(decisionsPath, {});
}

export async function saveDecision(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const lock = await readLock();
  if (lock) {
    const error = new Error(String(lock.message || "Agent is updating contract handoff data.")) as Error & {
      statusCode?: number;
    };
    error.statusCode = 423;
    throw error;
  }
  const id = String(input.id || "");
  const action = String(input.action || "");
  if (!id || !["approve", "changes", "block"].includes(action)) {
    const error = new Error("id and a valid action are required") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  const decisions = await readDecisions();
  const decision = {
    id,
    action,
    note: String(input.note || ""),
    decided_at: new Date().toISOString(),
  };
  decisions[id] = decision;
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`, { mode: 0o600 });
  return decision;
}
