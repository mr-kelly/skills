// Handoff file logic for human actions: rollout promote/rollback/hold, and
// anomaly acknowledgement. These never touch a real routing config — they only
// write app/.data/decisions.json, a local record of what the human decided.

import fs from "node:fs/promises";
import { withLock } from "./lock.ts";
import { DECISIONS_PATH } from "./paths.ts";
import type { Decisions, RolloutAction } from "./types.ts";

export function emptyDecisions(): Decisions {
  return { rollouts: {}, anomaly_acks: {} };
}

export async function readDecisions(): Promise<Decisions> {
  try {
    const raw = await fs.readFile(DECISIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Decisions>;
    return { rollouts: parsed.rollouts || {}, anomaly_acks: parsed.anomaly_acks || {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDecisions();
    throw error;
  }
}

async function writeDecisions(decisions: Decisions): Promise<void> {
  await fs.mkdir(DECISIONS_PATH.replace(/\/[^/]+$/, ""), { recursive: true });
  await fs.writeFile(DECISIONS_PATH, JSON.stringify(decisions, null, 2));
}

export async function recordRolloutDecision(routeId: string, action: RolloutAction, note: string): Promise<Decisions> {
  return withLock(`Recording rollout decision for ${routeId}`, async () => {
    const decisions = await readDecisions();
    decisions.rollouts[routeId] = {
      route_id: routeId,
      action,
      note: note || "",
      decided_at: new Date().toISOString(),
    };
    await writeDecisions(decisions);
    return decisions;
  });
}

export async function recordAnomalyAck(anomalyId: string, note: string): Promise<Decisions> {
  return withLock(`Acknowledging anomaly ${anomalyId}`, async () => {
    const decisions = await readDecisions();
    decisions.anomaly_acks[anomalyId] = {
      anomaly_id: anomalyId,
      note: note || "",
      acknowledged_at: new Date().toISOString(),
    };
    await writeDecisions(decisions);
    return decisions;
  });
}
