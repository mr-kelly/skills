#!/usr/bin/env node
// Dry-run-by-default executor stub. Reads approved sends and decisions THROUGH the
// data provider, re-checks the agent lock, the SEND quality gate, deliverability
// risk, and the consent/suppression list, then records concrete ESP handoff
// operations in execution_report.json. It performs NO external side effects: real
// scheduling and sending is delegated to the configured ESP by the skill,
// post-approval, per SKILL.md.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const reportPath = path.join(dataDir, "execution_report.json");

const apply = process.argv.includes("--apply");

interface Decision {
  action?: string;
  comment?: string;
  body?: string;
  chosen_variant?: string;
}

interface Send {
  send_id: string;
  ref?: number;
  type?: string;
  segment_id?: string;
  status?: string;
  proposed_action?: string;
  send_at?: string;
  reason?: string;
  body?: string;
  deliverability?: { risk?: string };
  quality_gate?: { verdict?: string } | null;
}

interface ExecutionResultItem {
  send_id: string;
  ref?: number;
  status: string;
  operation: string;
  esp?: string;
  segment_id?: string;
  send_at?: string;
  variants?: number;
  chosen_variant?: string;
  suppressed_excluded?: number;
  reason?: string;
  executed_at: string;
}

interface ExecutionReport {
  results?: ExecutionResultItem[];
}

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

const esp = process.env.KELLY_CAMPAIGNS_ESP || "configured-esp";

const provider = await createProvider();

const lock = await provider.getLock();
if (lock) {
  const owner = (lock as Record<string, unknown>).owner || "unknown";
  const message = (lock as Record<string, unknown>).message || "";
  console.error(`Refusing to execute: agent.lock is active (${owner}: ${message}).`);
  process.exit(1);
}

const state = await provider.getState();
const snapshot = state.snapshot as { sends?: Send[] } | null;
if (!snapshot) {
  console.error("No snapshot available from the data provider. Nothing to execute.");
  process.exit(1);
}

const decisions = ((state.decisions as { decisions?: Record<string, Decision> })?.decisions || {}) as Record<
  string,
  Decision
>;
const previousReport = await readJson<ExecutionReport>(reportPath);
const alreadyScheduled = new Set(
  (previousReport?.results || []).filter((item) => item.status === "scheduled").map((item) => item.send_id),
);

const now = new Date().toISOString();
const results: ExecutionResultItem[] = [];

for (const send of snapshot.sends || []) {
  const decision = decisions[send.send_id];
  if (!decision || decision.action !== "approve") continue;

  // Safety gate: never schedule a send the SEND audit blocked or with high
  // deliverability risk, even if a stale approve decision exists.
  if (send.quality_gate?.verdict === "block" || send.deliverability?.risk === "high") {
    results.push({
      send_id: send.send_id,
      ref: send.ref,
      status: "blocked",
      operation: "none",
      reason: "Quality gate BLOCK or high deliverability risk; refusing to schedule.",
      executed_at: now,
    });
    continue;
  }

  // Consent/suppression gate: block if an explicitly-targeted suppressed address
  // is present; otherwise carry the excluded count forward as a note.
  const suppression = await provider.evaluateSuppression(send as unknown as Record<string, unknown>);
  if (suppression.blocked) {
    results.push({
      send_id: send.send_id,
      ref: send.ref,
      status: "blocked",
      operation: "none",
      suppressed_excluded: suppression.suppressed_count,
      reason: suppression.note || "A suppressed address is explicitly targeted; refusing to schedule.",
      executed_at: now,
    });
    continue;
  }

  if (send.status === "done" || alreadyScheduled.has(send.send_id)) {
    results.push({
      send_id: send.send_id,
      ref: send.ref,
      status: "skipped",
      operation: "none",
      reason: "Already scheduled or sent; skipping to stay idempotent.",
      executed_at: now,
    });
    continue;
  }

  const isAbTest = send.proposed_action === "ab_test";
  results.push({
    send_id: send.send_id,
    ref: send.ref,
    status: apply ? "scheduled" : "dry_run",
    operation: isAbTest ? "ab_test" : "schedule_send",
    esp,
    segment_id: send.segment_id || "",
    send_at: send.send_at || "",
    variants: isAbTest ? 2 : undefined,
    chosen_variant: decision.chosen_variant || undefined,
    suppressed_excluded: suppression.suppressed_count || undefined,
    reason: send.reason || "",
    executed_at: now,
  });
}

if (!results.length) {
  console.log("No approved sends to schedule.");
  process.exit(0);
}

for (const result of results) {
  const suffix = result.suppressed_excluded ? ` (${result.suppressed_excluded} suppressed excluded)` : "";
  console.log(
    `#${result.ref} ${result.send_id}: ${result.status} ${result.operation}${result.segment_id ? ` -> ${result.segment_id}` : ""}${suffix}`,
  );
}

if (!apply) {
  console.log(`Dry run only (${results.length} operation(s)). Re-run with --apply to write ${reportPath}.`);
  process.exit(0);
}

// Preserve scheduled history so repeated --apply runs stay idempotent:
// a "skipped" result never replaces the scheduled record it refers to.
const freshlyScheduled = new Set(results.filter((item) => item.status === "scheduled").map((item) => item.send_id));
const carriedForward = (previousReport?.results || []).filter(
  (item) => item.status === "scheduled" && !freshlyScheduled.has(item.send_id),
);
const carriedIds = new Set(carriedForward.map((item) => item.send_id));
const report = {
  executed_at: now,
  dry_run: false,
  source: "kelly-campaigns",
  esp,
  results: [
    ...carriedForward,
    ...results.filter((item) => !(item.status === "skipped" && carriedIds.has(item.send_id))),
  ],
};
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}. Real scheduling/sending must be performed by the ESP per SKILL.md.`);
